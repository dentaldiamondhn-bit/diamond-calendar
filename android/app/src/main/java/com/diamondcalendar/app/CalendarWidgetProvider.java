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
 * The six week rows are served by {@link MonthWidgetService} as a RemoteViews
 * collection so the launcher always re-queries the app for the grid content
 * after widget re-creation (page switches, rotation, launcher restarts) instead
 * of relying on the last pushed {@code RemoteViews}, which stock launchers drop.
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

    static final String PREFS = "calendar_widget";
    private static final String KEY_OFFSET = "month_offset";

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    /**
     * Most recent fetch result. The {@link MonthWidgetService} factory reads
     * this on every launcher-driven re-render, so a recreated widget always
     * shows current content without waiting for a fresh provider callback.
     *
     * This is never overwritten with a failure: on a month-navigation tap or a
     * resize that hits a network/auth hiccup the grid keeps rendering whatever
     * was fetched last, so the tiles never blank out to the error placeholder.
     */
    static volatile WidgetMonth LAST_MONTH;

    /** Offset {@link #LAST_MONTH} was rendered for (keeps title/grid/nav aligned). */
    static volatile int LAST_OFFSET = 0;

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
                    if (month != null && month.weeks.isEmpty()) {
                        month = null;
                        error = "Sin datos";
                    }
                } catch (Exception e) {
                    Log.w(TAG, "widget fetch failed: " + e.getMessage());
                    error = "Toca para abrir la app";
                }
            }

            WidgetMonth display;
            int displayOffset;
            if (month != null) {
                // Publish the freshly fetched month atomically.
                LAST_MONTH = month;
                LAST_OFFSET = monthOffset;
                display = month;
                displayOffset = monthOffset;
                setOffset(appContext, monthOffset);
            } else {
                // Failed fetch or missing session: never blank the grid. Keep
                // rendering the most recent month (title, tiles and nav all
                // stay aligned to it), so month-nav / resize / re-render can
                // never clear the days out to the empty placeholder.
                display = LAST_MONTH;
                displayOffset = LAST_OFFSET;
                if (LAST_MONTH != null) setOffset(appContext, LAST_OFFSET);
            }
            // Surface text only when there is no grid to show at all.
            String shownError = (display == null) ? error : null;

            for (int id : ids) {
                boolean expanded = isExpanded(appContext, id, manager.getAppWidgetOptions(id));
                RemoteViews views = buildViews(appContext, display, displayOffset, shownError, id);
                manager.updateAppWidget(id, views);
                manager.notifyAppWidgetViewDataChanged(id, R.id.widget_week_list);
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

    /**
     * Builds the root widget RemoteViews: header (month nav / Hoy), weekday row,
     * and a ListView bound to {@link MonthWidgetService} for the six week rows.
     */
    private static RemoteViews buildViews(Context context, WidgetMonth month, int offset,
                                          String error, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.calendar_widget_grid_layout);

        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context, 0, "/calendario"));
        views.setOnClickPendingIntent(R.id.widget_title, openAppIntent(context, 1, "/calendario?view=month"));
        views.setOnClickPendingIntent(R.id.widget_prev,
                broadcastIntent(context, ACTION_PREV_MONTH, 2, offset - 1));
        views.setOnClickPendingIntent(R.id.widget_next,
                broadcastIntent(context, ACTION_NEXT_MONTH, 3, offset + 1));
        views.setOnClickPendingIntent(R.id.widget_today, broadcastIntent(context, ACTION_TODAY, 4, 0));

        // An error is only supplied when there is no grid data at all; otherwise
        // the month header + tiles keep rendering (e.g. after a failed refresh).
        if (error != null) {
            views.setTextViewText(R.id.widget_error, error);
            views.setTextViewText(R.id.widget_title, "Diamond Calendar");
            views.setViewVisibility(R.id.widget_today, android.view.View.GONE);
        } else {
            views.setTextViewText(R.id.widget_title, month.label);
            views.setViewVisibility(R.id.widget_today,
                    offset == 0 ? android.view.View.GONE : android.view.View.VISIBLE);
        }

        Intent service = new Intent(context, MonthWidgetService.class);
        service.setData(Uri.parse("widget://calendar/" + widgetId));
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        views.setRemoteAdapter(R.id.widget_week_list, service);
        views.setEmptyView(R.id.widget_week_list, R.id.widget_error);
        views.setPendingIntentTemplate(R.id.widget_week_list,
                openAppIntent(context, 50, "/calendario"));

        return views;
    }

    static int parseColor(String value) {
        try {
            if (value != null && !value.isEmpty()) return Color.parseColor(value);
        } catch (Exception ignored) {
        }
        return 0xFF14B8A6;
    }

    /** "HH:mm[:ss]" → "h:mm AM/PM" (drops the seconds the API returns). */
    static String formatTime(String value) {
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

    static class WidgetMonth {
        String label = "";
        final List<List<WidgetDay>> weeks = new ArrayList<>();
    }

    static class WidgetDay {
        String date = "";
        int day;
        boolean inMonth = true;
        boolean isToday;
        final List<String> dotColors = new ArrayList<>();
        final List<String> labels = new ArrayList<>();
        final List<String> times = new ArrayList<>();
    }
}