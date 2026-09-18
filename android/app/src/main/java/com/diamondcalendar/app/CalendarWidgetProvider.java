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

    private static final String PREFS = "calendar_widget";
    private static final String KEY_OFFSET = "month_offset";

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private static final int[] WEEK_ROW_IDS = {
            R.id.widget_week_1, R.id.widget_week_2, R.id.widget_week_3,
            R.id.widget_week_4, R.id.widget_week_5, R.id.widget_week_6,
    };
    private static final int[] DAY_DOT_IDS = {
            R.id.day_dot_1, R.id.day_dot_2, R.id.day_dot_3,
    };
    private static final int[] DAY_LABEL_IDS = {
            R.id.day_label_1, R.id.day_label_2,
    };

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
        refreshAsync(context, appWidgetManager, appWidgetIds);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)) {
            refreshAll(context);
            return;
        }
        if (ACTION_PREV_MONTH.equals(action)) {
            setOffset(context, getOffset(context) - 1);
            refreshAll(context);
            return;
        }
        if (ACTION_NEXT_MONTH.equals(action)) {
            setOffset(context, getOffset(context) + 1);
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
        refreshAsync(context, manager, ids);
    }

    private void refreshAsync(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null || ids.length == 0) return;
        final Context appContext = context.getApplicationContext();
        final int offset = getOffset(appContext);
        final String cookies = readCookies();
        EXECUTOR.execute(() -> {
            WidgetMonth month = null;
            String error = null;
            if (cookies == null) {
                error = "Abre la app para sincronizar";
            } else {
                try {
                    month = fetchMonth(cookies, offset);
                } catch (Exception e) {
                    Log.w(TAG, "widget fetch failed: " + e.getMessage());
                    error = "Toca para abrir la app";
                }
            }
            for (int id : ids) {
                boolean expanded = isExpanded(appContext, id, manager.getAppWidgetOptions(id));
                RemoteViews views = buildViews(appContext, month, offset, error, expanded);
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
                                if (day.labels.size() < DAY_LABEL_IDS.length) {
                                    day.labels.add(item.optString("label", ""));
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
        views.setOnClickPendingIntent(R.id.widget_prev, broadcastIntent(context, ACTION_PREV_MONTH, 2));
        views.setOnClickPendingIntent(R.id.widget_next, broadcastIntent(context, ACTION_NEXT_MONTH, 3));
        views.setOnClickPendingIntent(R.id.widget_today, broadcastIntent(context, ACTION_TODAY, 4));

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

        // Each row is statically declared in the layout, so cells are added one
        // level deep (nested RemoteViews cannot themselves call addView).
        for (int w = 0; w < WEEK_ROW_IDS.length; w++) {
            List<WidgetDay> week = month.weeks.size() > w ? month.weeks.get(w) : null;
            for (int d = 0; d < 7; d++) {
                WidgetDay day = (week != null && week.size() > d) ? week.get(d) : null;
                views.addView(WEEK_ROW_IDS[w], buildDayCell(context, day, w * 7 + d, expanded));
            }
        }

        return views;
    }

    private static RemoteViews buildDayCell(Context context, WidgetDay day, int index, boolean expanded) {
        RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.calendar_widget_day_cell);

        if (day == null) {
            cell.setViewVisibility(R.id.day_number, android.view.View.INVISIBLE);
            for (int id : DAY_DOT_IDS) cell.setViewVisibility(id, android.view.View.GONE);
            for (int id : DAY_LABEL_IDS) cell.setViewVisibility(id, android.view.View.GONE);
            return cell;
        }

        cell.setTextViewText(R.id.day_number, String.valueOf(day.day));
        int textColor = day.inMonth
                ? context.getColor(R.color.widget_day_text)
                : context.getColor(R.color.widget_day_dim);
        if (day.isToday) {
            cell.setInt(R.id.day_number, "setBackgroundResource", R.drawable.calendar_widget_today_bg);
            textColor = context.getColor(R.color.widget_today_text);
        }
        cell.setTextColor(R.id.day_number, textColor);

        if (expanded) {
            // Large footprint — show up to 2 event names per day instead of dots.
            for (int id : DAY_DOT_IDS) cell.setViewVisibility(id, android.view.View.GONE);
            for (int i = 0; i < DAY_LABEL_IDS.length; i++) {
                String label = i < day.labels.size() ? day.labels.get(i) : "";
                cell.setTextViewText(DAY_LABEL_IDS[i], label);
                cell.setViewVisibility(DAY_LABEL_IDS[i], android.view.View.VISIBLE);
            }
        } else {
            // Compact footprint — event dots.
            for (int id : DAY_LABEL_IDS) {
                cell.setViewVisibility(id, android.view.View.GONE);
                cell.setTextViewText(id, "");
            }
            for (int i = 0; i < DAY_DOT_IDS.length; i++) {
                if (i < day.dotColors.size()) {
                    cell.setViewVisibility(DAY_DOT_IDS[i], android.view.View.VISIBLE);
                    cell.setInt(DAY_DOT_IDS[i], "setColorFilter", parseColor(day.dotColors.get(i)));
                } else {
                    cell.setViewVisibility(DAY_DOT_IDS[i], android.view.View.GONE);
                }
            }
        }

        String path = "/calendario?view=day&date=" + Uri.encode(day.date);
        cell.setOnClickPendingIntent(R.id.day_cell_root, openAppIntent(context, 100 + index, path));
        return cell;
    }

    private static int parseColor(String value) {
        try {
            if (value != null && !value.isEmpty()) return Color.parseColor(value);
        } catch (Exception ignored) {
        }
        return 0xFF14B8A6;
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

    private static PendingIntent broadcastIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, CalendarWidgetProvider.class);
        intent.setAction(action);
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
    }
}