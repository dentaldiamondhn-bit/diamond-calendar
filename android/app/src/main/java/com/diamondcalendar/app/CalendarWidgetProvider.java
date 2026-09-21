package com.diamondcalendar.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Home-launcher month-calendar widget (Google-Calendar style).
 *
 * Renders a Monday-start 6x7 month grid with per-day event dots, prev/next
 * month navigation and a "Hoy" shortcut. Day taps deep-link into the day view.
 *
 * Auth reuses the Clerk session cookies the Capacitor WebView stores for the
 * app origin — the widget fetches {@code /api/widget/month} (cookie-authenticated).
 */
public class CalendarWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "CalendarWidget";
    private static final String BASE_URL = "https://calendario.dentaldiamondhn.com";

    public static final String ACTION_REFRESH = "com.diamondcalendar.app.WIDGET_REFRESH";
    public static final String ACTION_PREV_MONTH = "com.diamondcalendar.app.WIDGET_PREV_MONTH";
    public static final String ACTION_NEXT_MONTH = "com.diamondcalendar.app.WIDGET_NEXT_MONTH";
    public static final String ACTION_TODAY = "com.diamondcalendar.app.WIDGET_TODAY";
    public static final String EXTRA_WIDGET_PATH = "widget_path";
    public static final String EXTRA_OFFSET = "widget_offset";

    private static final String PREFS = "calendar_widget";
    private static final String KEY_OFFSET = "month_offset";

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private static final int[] WEEK_ROW_IDS = {
            R.id.widget_week_1, R.id.widget_week_2, R.id.widget_week_3,
            R.id.widget_week_4, R.id.widget_week_5, R.id.widget_week_6,
    };
    private static final int MAX_LABEL_LENGTH = 18;

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager,
                                          int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
        // Track the widget footprint so expanded layouts (event names) follow the
        // user's resize, even on launchers that don't report sizes at request time.
        isExpanded(context, appWidgetId, newOptions);
        refreshAll(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        refreshAsync(context, appWidgetManager, appWidgetIds, getOffset(context));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)) {
            refreshAll(context);
            return;
        }
        if (ACTION_PREV_MONTH.equals(action)) {
            // Target month travels inside the broadcast itself so a re-fired /
            // raced broadcast can never navigate against a stale pref value.
            setOffset(context, intent.getIntExtra(EXTRA_OFFSET, getOffset(context) - 1));
            refreshAll(context);
            return;
        }
        if (ACTION_NEXT_MONTH.equals(action)) {
            setOffset(context, intent.getIntExtra(EXTRA_OFFSET, getOffset(context) + 1));
            refreshAll(context);
            return;
        }
        if (ACTION_TODAY.equals(action)) {
            setOffset(context, 0);
            refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    private void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, CalendarWidgetProvider.class));
        refreshAsync(context, manager, ids, getOffset(context));
    }

    private void refreshAsync(Context context, AppWidgetManager manager, int[] ids, int offset) {
        if (ids == null || ids.length == 0) return;
        final Context appContext = context.getApplicationContext();
        final int monthOffset = offset;
        final String cookies = readCookies();
        EXECUTOR.execute(() -> {
            WidgetMonth month = null;
            String error = null;
            if (cookies == null) {
                error = "Abre la app para sincronizar";
            } else {
                try {
                    month = fetchMonth(cookies, monthOffset);
                } catch (Exception e) {
                    Log.w(TAG, "widget fetch failed: " + e.getMessage());
                    error = "Toca para abrir la app";
                }
            }
            for (int id : ids) {
                boolean expanded = isExpanded(appContext, id, manager.getAppWidgetOptions(id));
                RemoteViews views = buildViews(appContext, month, monthOffset, error, expanded);
                manager.updateAppWidget(id, views);
            }
        });
    }

    /**
     * Detects the current widget footprint from the launcher options (dp, API 31+)
     * and stores it per widget id. On older launchers that never report options we
     * fall back to whatever was stored last (defaults to the compact dot view).
     */
    private static boolean isExpanded(Context context, int widgetId, Bundle options) {
        float width = optSize(options, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        float height = optSize(options, AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean expanded;
        if (width <= 0 && height <= 0) {
            expanded = prefs.getBoolean("expanded_" + widgetId, false);
        } else {
            expanded = width >= 380 || height >= 330;
            prefs.edit().putBoolean("expanded_" + widgetId, expanded).apply();
        }
        return expanded;
    }

    private static float optSize(Bundle options, String key) {
        if (options == null || !options.containsKey(key)) return 0f;
        Object value = options.get(key);
        if (value instanceof Number) return ((Number) value).floatValue();
        try {
            return Float.parseFloat(String.valueOf(value));
        } catch (Exception ignored) {
            return 0f;
        }
    }

    private static int getOffset(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_OFFSET, 0);
    }

    private static void setOffset(Context context, int offset) {
        SharedPreferences.Editor editor =
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.putInt(KEY_OFFSET, offset);
        editor.apply();
    }

    /** Reads the app-origin cookies from the WebView cookie store (main thread). */
    private static String readCookies() {
        try {
            CookieManager manager = CookieManager.getInstance();
            String cookies = manager.getCookie(BASE_URL);
            if (cookies == null || cookies.isEmpty()) return null;
            return cookies;
        } catch (Exception e) {
            Log.w(TAG, "cookie read failed: " + e.getMessage());
        }
        return null;
    }

    private static WidgetMonth fetchMonth(String cookies, int offset) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(BASE_URL + "/api/widget/month?offset=" + offset);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("Cookie", cookies);
            conn.setRequestProperty("Accept", "application/json");

            int code = conn.getResponseCode();
            InputStream stream = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
            String body = readStream(stream);
            if (code != 200) {
                throw new IllegalStateException("HTTP " + code);
            }

            WidgetMonth month = new WidgetMonth();
            JSONObject json = new JSONObject(body);
            month.label = json.optString("monthLabel", "");
            JSONArray weeks = json.optJSONArray("weeks");
            if (weeks != null) {
                for (int w = 0; w < weeks.length(); w++) {
                    JSONArray weekArray = weeks.optJSONArray(w);
                    if (weekArray == null) continue;
                    List<WidgetDay> week = new ArrayList<>();
                    for (int d = 0; d < weekArray.length(); d++) {
                        JSONObject cell = weekArray.optJSONObject(d);
                        if (cell == null) continue;
                        WidgetDay day = new WidgetDay();
                        day.date = cell.optString("date", "");
                        day.day = cell.optInt("day", 0);
                        day.inMonth = cell.optBoolean("inMonth", true);
                        day.isToday = cell.optBoolean("isToday", false);
                        JSONArray events = cell.optJSONArray("events");
                        if (events != null) {
                            for (int e = 0; e < events.length(); e++) {
                                JSONObject item = events.optJSONObject(e);
                                if (item == null) continue;
                                day.dotColors.add(item.optString("color", ""));
                                if (day.labels.size() < 2) {
                                    day.labels.add(item.optString("label", ""));
                                    day.times.add(item.optString("time", ""));
                                }
                            }
                        }
                        week.add(day);
                    }
                    month.weeks.add(week);
                }
            }
            return month;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private static RemoteViews buildViews(Context context, WidgetMonth month, int offset, String error,
                                          boolean expanded) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.calendar_widget_layout);

        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context, 0, "/calendario"));
        views.setOnClickPendingIntent(R.id.widget_title, openAppIntent(context, 1, "/calendario?view=month"));
        views.setOnClickPendingIntent(R.id.widget_prev,
                broadcastIntent(context, ACTION_PREV_MONTH, 2, offset - 1));
        views.setOnClickPendingIntent(R.id.widget_next,
                broadcastIntent(context, ACTION_NEXT_MONTH, 3, offset + 1));
        views.setOnClickPendingIntent(R.id.widget_today, broadcastIntent(context, ACTION_TODAY, 4, 0));

        if (error != null || month == null || month.weeks.isEmpty()) {
            for (int id : WEEK_ROW_IDS) views.setViewVisibility(id, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_weekdays, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_divider, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_today, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_error, android.view.View.VISIBLE);
            views.setTextViewText(R.id.widget_error, error != null ? error : "Sin datos");
            views.setTextViewText(R.id.widget_title, "Diamond Calendar");
            return views;
        }

        views.setViewVisibility(R.id.widget_error, android.view.View.GONE);
        views.setViewVisibility(R.id.widget_weekdays, android.view.View.VISIBLE);
        views.setViewVisibility(R.id.widget_divider, android.view.View.VISIBLE);
        views.setTextViewText(R.id.widget_title, month.label);
        views.setViewVisibility(R.id.widget_today, offset == 0 ? android.view.View.GONE : android.view.View.VISIBLE);

        // The 42 day cells are statically declared in the layout (aapt-inflated,
        // not addView-injected) so launchers restore them after page switches /
        // widget re-inflation; we only update their contents by view id.
        // Rows beyond the month's actual week span are hidden (GONE) so a
        // 5-week month renders five rows that expand to fill the whole widget.
        int weekCount = Math.min(month.weeks.size(), 6);
        for (int w = 0; w < 6; w++) {
            if (w >= weekCount) {
                views.setViewVisibility(WEEK_ROW_IDS[w], android.view.View.GONE);
                continue;
            }
            views.setViewVisibility(WEEK_ROW_IDS[w], android.view.View.VISIBLE);
            List<WidgetDay> week = month.weeks.get(w);
            for (int c = 0; c < 7; c++) {
                WidgetDay day = c < week.size() ? week.get(c) : null;
                fillDayCell(context, views, w * 7 + c, day, expanded);
            }
        }

        return views;
    }

    private static void fillDayCell(Context context, RemoteViews views, int index, WidgetDay day,
                                    boolean expanded) {
        int numberId = CalendarWidgetIds.DAY_NUMBER[index];

        if (day == null) {
            views.setViewVisibility(numberId, android.view.View.INVISIBLE);
            return;
        }

        views.setTextViewText(numberId, String.valueOf(day.day));
        int textColor = day.inMonth
                ? context.getColor(R.color.widget_day_text)
                : context.getColor(R.color.widget_day_dim);
        if (day.isToday) {
            views.setInt(numberId, "setBackgroundResource", R.drawable.calendar_widget_today_bg);
            textColor = context.getColor(R.color.widget_today_text);
        }
        views.setTextColor(numberId, textColor);

        if (expanded) {
            // Large footprint — show up to 2 green pills per day: the patient
            // name (max 18 letters) with the event time beside it.
            hideDots(views, index);
            for (int k = 0; k < 2; k++) {
                int labelId = labelIdFor(index, k);
                int nameId = nameIdFor(index, k);
                int timeId = timeIdFor(index, k);
                views.setViewVisibility(labelId, android.view.View.VISIBLE);
                boolean has = k < day.labels.size();
                if (has) {
                    views.setTextViewText(nameId, shorten(day.labels.get(k)));
                    views.setTextViewText(timeId, formatTime(day.times.size() > k ? day.times.get(k) : ""));
                    views.setViewVisibility(nameId, android.view.View.VISIBLE);
                    views.setViewVisibility(timeId, android.view.View.VISIBLE);
                    // Color the event pill with the procedure color so expanded
                    // events carry their color like the compact dots do.
                    String color = k < day.dotColors.size() ? day.dotColors.get(k) : "";
                    views.setTextColor(nameId, parseColor(color));
                } else {
                    views.setTextViewText(nameId, "");
                    views.setTextViewText(timeId, "");
                    views.setViewVisibility(nameId, android.view.View.GONE);
                    views.setViewVisibility(timeId, android.view.View.GONE);
                }
            }
        } else {
            // Compact footprint — event dots.
            hideLabels(views, index);
            int[][] dots = {CalendarWidgetIds.DAY_DOT_1, CalendarWidgetIds.DAY_DOT_2, CalendarWidgetIds.DAY_DOT_3};
            for (int k = 0; k < dots.length; k++) {
                int dotId = dots[k][index];
                if (k < day.dotColors.size()) {
                    views.setViewVisibility(dotId, android.view.View.VISIBLE);
                    views.setInt(dotId, "setColorFilter", parseColor(day.dotColors.get(k)));
                } else {
                    views.setViewVisibility(dotId, android.view.View.GONE);
                }
            }
        }

        views.setOnClickPendingIntent(CalendarWidgetIds.DAY_CELL[index],
                openAppIntent(context, 100 + index, "/calendario?view=day&date=" + Uri.encode(day.date)));
    }

    private static int labelIdFor(int index, int slot) {
        return slot == 0 ? CalendarWidgetIds.DAY_LABEL_1[index] : CalendarWidgetIds.DAY_LABEL_2[index];
    }

    private static int nameIdFor(int index, int slot) {
        return slot == 0 ? CalendarWidgetIds.DAY_NAME_1[index] : CalendarWidgetIds.DAY_NAME_2[index];
    }

    private static int timeIdFor(int index, int slot) {
        return slot == 0 ? CalendarWidgetIds.DAY_TIME_1[index] : CalendarWidgetIds.DAY_TIME_2[index];
    }

    private static void hideDots(RemoteViews views, int index) {
        int[][] dots = {CalendarWidgetIds.DAY_DOT_1, CalendarWidgetIds.DAY_DOT_2, CalendarWidgetIds.DAY_DOT_3};
        for (int[] arr : dots) views.setViewVisibility(arr[index], android.view.View.GONE);
    }

    private static void hideLabels(RemoteViews views, int index) {
        views.setViewVisibility(labelIdFor(index, 0), android.view.View.GONE);
        views.setViewVisibility(labelIdFor(index, 1), android.view.View.GONE);
    }

    private static int parseColor(String value) {
        try {
            if (value != null && !value.isEmpty()) return Color.parseColor(value);
        } catch (Exception ignored) {
        }
        return 0xFF14B8A6;
    }

    /** Trims and truncates to MAX_LABEL_LENGTH letters so the event time fits. */
    private static String shorten(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        if (trimmed.length() <= MAX_LABEL_LENGTH) return trimmed;
        return trimmed.substring(0, MAX_LABEL_LENGTH);
    }

    /** "HH:mm[:ss]" → "h:mm AM/PM" (drops the seconds the API returns). */
    private static String formatTime(String value) {
        if (value == null || value.isEmpty()) return "";
        String[] parts = value.split(":");
        if (parts.length < 2) return value;
        try {
            int hour = Integer.parseInt(parts[0]);
            String minute = parts[1];
            if (minute.length() > 2) minute = minute.substring(0, 2);
            if (hour < 0 || hour > 23) return value;
            int h12 = hour % 12 == 0 ? 12 : hour % 12;
            return h12 + ":" + minute + (hour >= 12 ? " PM" : " AM");
        } catch (Exception e) {
            return value;
        }
    }

    private static PendingIntent openAppIntent(Context context, int requestCode, String path) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.putExtra(EXTRA_WIDGET_PATH, path);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent broadcastIntent(Context context, String action, int requestCode, int offset) {
        Intent intent = new Intent(context, CalendarWidgetProvider.class);
        intent.setAction(action);
        intent.putExtra(EXTRA_OFFSET, offset);
        return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Minimal POJOs (kept static to avoid extra files). */
    private static class WidgetMonth {
        String label = "";
        final List<List<WidgetDay>> weeks = new ArrayList<>();
    }

    private static class WidgetDay {
        String date = "";
        int day;
        boolean inMonth = true;
        boolean isToday;
        final List<String> dotColors = new ArrayList<>();
        final List<String> labels = new ArrayList<>();
        final List<String> times = new ArrayList<>();
    }
}