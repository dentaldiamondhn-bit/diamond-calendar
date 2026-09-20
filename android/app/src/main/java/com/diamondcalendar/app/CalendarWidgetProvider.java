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
 * The whole grid — header, weekday labels and all six week rows — is baked
 * into the widget layout and filled by this provider with static RemoteViews
 * actions (text/color/visibility). No RemoteViewsService collection is used,
 * so a launcher can never fall into a per-row "Loading..." state, and no
 * view-tree injection is needed, so "Couldn't add widget" can't occur either.
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

    /** Per-widget launcher-reported footprint (dp), persisted so the week-row
     * factory can size the grid to the real portrait/landscape dimensions even
     * when a launcher later reports only the nominal minimum sizes. */
    static final String KEY_SIZE_W = "size_w_";
    static final String KEY_SIZE_H = "size_h_";

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

/**
     * Most recent fetch result, read by {@link #refreshAsync} to re-render the
     * grid. Never overwritten with a failure: on a month-navigation tap or a
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
                RemoteViews views = buildViews(appContext, display, displayOffset, shownError, id, expanded);
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
        if (width > 0 && height > 0) {
            prefs.edit()
                    .putFloat(KEY_SIZE_W + widgetId, width)
                    .putFloat(KEY_SIZE_H + widgetId, height)
                    .apply();
        } else {
            if (width <= 0) width = prefs.getFloat(KEY_SIZE_W + widgetId, 0f);
            if (height <= 0) height = prefs.getFloat(KEY_SIZE_H + widgetId, 0f);
        }
        boolean expanded;
        if (width <= 0 && height <= 0) {
            expanded = prefs.getBoolean("expanded_" + widgetId, false);
        } else {
            // Portrait (height > width) shows event pills as soon as it's tall
            // enough; wide/landscape footprints qualify on width.
            boolean portrait = height > width;
            expanded = width >= 380 || height >= 330 || (portrait && height >= 280);
            prefs.edit().putBoolean("expanded_" + widgetId, expanded).apply();
        }
        return expanded;
    }

    /**
     * Last launcher-reported footprint for a widget id (0 when unknown).
     * Used by the week-row factory to distribute the row heights evenly.
     */
    static float sizeFor(Context context, int widgetId, String keyBase) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getFloat(keyBase + widgetId, 0f);
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
     * and all six week rows embedded statically in the host layout. The provider
     * only sets text/colors/visibility on those fixed view ids — there is no
     * RemoteViewsService collection and no view-tree injection, so no launcher
     * "Loading..." placeholder or "Couldn't add widget" phase can ever exist.
     */
    private static RemoteViews buildViews(Context context, WidgetMonth month, int offset,
                                          String error, int widgetId, boolean expanded) {
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
            views.setViewVisibility(R.id.widget_weeks, android.view.View.GONE);
        } else {
            views.setTextViewText(R.id.widget_title, month.label);
            views.setViewVisibility(R.id.widget_today,
                    offset == 0 ? android.view.View.GONE : android.view.View.VISIBLE);
            views.setViewVisibility(R.id.widget_weeks, android.view.View.VISIBLE);
            // The API always returns 6 weeks now; render them defensively anyway.
            for (int w = 0; w < 6; w++) {
                List<WidgetDay> week = w < month.weeks.size() ? month.weeks.get(w) : null;
                fillWeek(context, views, week, w, expanded);
            }
        }

        return views;
    }

    private static final int[][] CELL_IDS = {
        {R.id.day_cell_0_0, R.id.day_cell_0_1, R.id.day_cell_0_2, R.id.day_cell_0_3, R.id.day_cell_0_4, R.id.day_cell_0_5, R.id.day_cell_0_6},
        {R.id.day_cell_1_0, R.id.day_cell_1_1, R.id.day_cell_1_2, R.id.day_cell_1_3, R.id.day_cell_1_4, R.id.day_cell_1_5, R.id.day_cell_1_6},
        {R.id.day_cell_2_0, R.id.day_cell_2_1, R.id.day_cell_2_2, R.id.day_cell_2_3, R.id.day_cell_2_4, R.id.day_cell_2_5, R.id.day_cell_2_6},
        {R.id.day_cell_3_0, R.id.day_cell_3_1, R.id.day_cell_3_2, R.id.day_cell_3_3, R.id.day_cell_3_4, R.id.day_cell_3_5, R.id.day_cell_3_6},
        {R.id.day_cell_4_0, R.id.day_cell_4_1, R.id.day_cell_4_2, R.id.day_cell_4_3, R.id.day_cell_4_4, R.id.day_cell_4_5, R.id.day_cell_4_6},
        {R.id.day_cell_5_0, R.id.day_cell_5_1, R.id.day_cell_5_2, R.id.day_cell_5_3, R.id.day_cell_5_4, R.id.day_cell_5_5, R.id.day_cell_5_6},
    };
    private static final int[][] NUMBER_IDS = {
        {R.id.day_number_0_0, R.id.day_number_0_1, R.id.day_number_0_2, R.id.day_number_0_3, R.id.day_number_0_4, R.id.day_number_0_5, R.id.day_number_0_6},
        {R.id.day_number_1_0, R.id.day_number_1_1, R.id.day_number_1_2, R.id.day_number_1_3, R.id.day_number_1_4, R.id.day_number_1_5, R.id.day_number_1_6},
        {R.id.day_number_2_0, R.id.day_number_2_1, R.id.day_number_2_2, R.id.day_number_2_3, R.id.day_number_2_4, R.id.day_number_2_5, R.id.day_number_2_6},
        {R.id.day_number_3_0, R.id.day_number_3_1, R.id.day_number_3_2, R.id.day_number_3_3, R.id.day_number_3_4, R.id.day_number_3_5, R.id.day_number_3_6},
        {R.id.day_number_4_0, R.id.day_number_4_1, R.id.day_number_4_2, R.id.day_number_4_3, R.id.day_number_4_4, R.id.day_number_4_5, R.id.day_number_4_6},
        {R.id.day_number_5_0, R.id.day_number_5_1, R.id.day_number_5_2, R.id.day_number_5_3, R.id.day_number_5_4, R.id.day_number_5_5, R.id.day_number_5_6},
    };
    private static final int[][][] DOT_IDS = {
        {
            {R.id.day_dot_0_0_1, R.id.day_dot_0_0_2, R.id.day_dot_0_0_3},
            {R.id.day_dot_0_1_1, R.id.day_dot_0_1_2, R.id.day_dot_0_1_3},
            {R.id.day_dot_0_2_1, R.id.day_dot_0_2_2, R.id.day_dot_0_2_3},
            {R.id.day_dot_0_3_1, R.id.day_dot_0_3_2, R.id.day_dot_0_3_3},
            {R.id.day_dot_0_4_1, R.id.day_dot_0_4_2, R.id.day_dot_0_4_3},
            {R.id.day_dot_0_5_1, R.id.day_dot_0_5_2, R.id.day_dot_0_5_3},
            {R.id.day_dot_0_6_1, R.id.day_dot_0_6_2, R.id.day_dot_0_6_3},
        },
        {
            {R.id.day_dot_1_0_1, R.id.day_dot_1_0_2, R.id.day_dot_1_0_3},
            {R.id.day_dot_1_1_1, R.id.day_dot_1_1_2, R.id.day_dot_1_1_3},
            {R.id.day_dot_1_2_1, R.id.day_dot_1_2_2, R.id.day_dot_1_2_3},
            {R.id.day_dot_1_3_1, R.id.day_dot_1_3_2, R.id.day_dot_1_3_3},
            {R.id.day_dot_1_4_1, R.id.day_dot_1_4_2, R.id.day_dot_1_4_3},
            {R.id.day_dot_1_5_1, R.id.day_dot_1_5_2, R.id.day_dot_1_5_3},
            {R.id.day_dot_1_6_1, R.id.day_dot_1_6_2, R.id.day_dot_1_6_3},
        },
        {
            {R.id.day_dot_2_0_1, R.id.day_dot_2_0_2, R.id.day_dot_2_0_3},
            {R.id.day_dot_2_1_1, R.id.day_dot_2_1_2, R.id.day_dot_2_1_3},
            {R.id.day_dot_2_2_1, R.id.day_dot_2_2_2, R.id.day_dot_2_2_3},
            {R.id.day_dot_2_3_1, R.id.day_dot_2_3_2, R.id.day_dot_2_3_3},
            {R.id.day_dot_2_4_1, R.id.day_dot_2_4_2, R.id.day_dot_2_4_3},
            {R.id.day_dot_2_5_1, R.id.day_dot_2_5_2, R.id.day_dot_2_5_3},
            {R.id.day_dot_2_6_1, R.id.day_dot_2_6_2, R.id.day_dot_2_6_3},
        },
        {
            {R.id.day_dot_3_0_1, R.id.day_dot_3_0_2, R.id.day_dot_3_0_3},
            {R.id.day_dot_3_1_1, R.id.day_dot_3_1_2, R.id.day_dot_3_1_3},
            {R.id.day_dot_3_2_1, R.id.day_dot_3_2_2, R.id.day_dot_3_2_3},
            {R.id.day_dot_3_3_1, R.id.day_dot_3_3_2, R.id.day_dot_3_3_3},
            {R.id.day_dot_3_4_1, R.id.day_dot_3_4_2, R.id.day_dot_3_4_3},
            {R.id.day_dot_3_5_1, R.id.day_dot_3_5_2, R.id.day_dot_3_5_3},
            {R.id.day_dot_3_6_1, R.id.day_dot_3_6_2, R.id.day_dot_3_6_3},
        },
        {
            {R.id.day_dot_4_0_1, R.id.day_dot_4_0_2, R.id.day_dot_4_0_3},
            {R.id.day_dot_4_1_1, R.id.day_dot_4_1_2, R.id.day_dot_4_1_3},
            {R.id.day_dot_4_2_1, R.id.day_dot_4_2_2, R.id.day_dot_4_2_3},
            {R.id.day_dot_4_3_1, R.id.day_dot_4_3_2, R.id.day_dot_4_3_3},
            {R.id.day_dot_4_4_1, R.id.day_dot_4_4_2, R.id.day_dot_4_4_3},
            {R.id.day_dot_4_5_1, R.id.day_dot_4_5_2, R.id.day_dot_4_5_3},
            {R.id.day_dot_4_6_1, R.id.day_dot_4_6_2, R.id.day_dot_4_6_3},
        },
        {
            {R.id.day_dot_5_0_1, R.id.day_dot_5_0_2, R.id.day_dot_5_0_3},
            {R.id.day_dot_5_1_1, R.id.day_dot_5_1_2, R.id.day_dot_5_1_3},
            {R.id.day_dot_5_2_1, R.id.day_dot_5_2_2, R.id.day_dot_5_2_3},
            {R.id.day_dot_5_3_1, R.id.day_dot_5_3_2, R.id.day_dot_5_3_3},
            {R.id.day_dot_5_4_1, R.id.day_dot_5_4_2, R.id.day_dot_5_4_3},
            {R.id.day_dot_5_5_1, R.id.day_dot_5_5_2, R.id.day_dot_5_5_3},
            {R.id.day_dot_5_6_1, R.id.day_dot_5_6_2, R.id.day_dot_5_6_3},
        },
    };

    private static final int[][] DOTS_CONTAINER_IDS = {
        {R.id.day_dots_0_0, R.id.day_dots_0_1, R.id.day_dots_0_2, R.id.day_dots_0_3, R.id.day_dots_0_4, R.id.day_dots_0_5, R.id.day_dots_0_6},
        {R.id.day_dots_1_0, R.id.day_dots_1_1, R.id.day_dots_1_2, R.id.day_dots_1_3, R.id.day_dots_1_4, R.id.day_dots_1_5, R.id.day_dots_1_6},
        {R.id.day_dots_2_0, R.id.day_dots_2_1, R.id.day_dots_2_2, R.id.day_dots_2_3, R.id.day_dots_2_4, R.id.day_dots_2_5, R.id.day_dots_2_6},
        {R.id.day_dots_3_0, R.id.day_dots_3_1, R.id.day_dots_3_2, R.id.day_dots_3_3, R.id.day_dots_3_4, R.id.day_dots_3_5, R.id.day_dots_3_6},
        {R.id.day_dots_4_0, R.id.day_dots_4_1, R.id.day_dots_4_2, R.id.day_dots_4_3, R.id.day_dots_4_4, R.id.day_dots_4_5, R.id.day_dots_4_6},
        {R.id.day_dots_5_0, R.id.day_dots_5_1, R.id.day_dots_5_2, R.id.day_dots_5_3, R.id.day_dots_5_4, R.id.day_dots_5_5, R.id.day_dots_5_6},
    };
    private static final int[][] PILL_A_IDS = {
        {R.id.day_pill_0_0_1, R.id.day_pill_0_1_1, R.id.day_pill_0_2_1, R.id.day_pill_0_3_1, R.id.day_pill_0_4_1, R.id.day_pill_0_5_1, R.id.day_pill_0_6_1},
        {R.id.day_pill_1_0_1, R.id.day_pill_1_1_1, R.id.day_pill_1_2_1, R.id.day_pill_1_3_1, R.id.day_pill_1_4_1, R.id.day_pill_1_5_1, R.id.day_pill_1_6_1},
        {R.id.day_pill_2_0_1, R.id.day_pill_2_1_1, R.id.day_pill_2_2_1, R.id.day_pill_2_3_1, R.id.day_pill_2_4_1, R.id.day_pill_2_5_1, R.id.day_pill_2_6_1},
        {R.id.day_pill_3_0_1, R.id.day_pill_3_1_1, R.id.day_pill_3_2_1, R.id.day_pill_3_3_1, R.id.day_pill_3_4_1, R.id.day_pill_3_5_1, R.id.day_pill_3_6_1},
        {R.id.day_pill_4_0_1, R.id.day_pill_4_1_1, R.id.day_pill_4_2_1, R.id.day_pill_4_3_1, R.id.day_pill_4_4_1, R.id.day_pill_4_5_1, R.id.day_pill_4_6_1},
        {R.id.day_pill_5_0_1, R.id.day_pill_5_1_1, R.id.day_pill_5_2_1, R.id.day_pill_5_3_1, R.id.day_pill_5_4_1, R.id.day_pill_5_5_1, R.id.day_pill_5_6_1},
    };
    private static final int[][] PILL_B_IDS = {
        {R.id.day_pill_0_0_2, R.id.day_pill_0_1_2, R.id.day_pill_0_2_2, R.id.day_pill_0_3_2, R.id.day_pill_0_4_2, R.id.day_pill_0_5_2, R.id.day_pill_0_6_2},
        {R.id.day_pill_1_0_2, R.id.day_pill_1_1_2, R.id.day_pill_1_2_2, R.id.day_pill_1_3_2, R.id.day_pill_1_4_2, R.id.day_pill_1_5_2, R.id.day_pill_1_6_2},
        {R.id.day_pill_2_0_2, R.id.day_pill_2_1_2, R.id.day_pill_2_2_2, R.id.day_pill_2_3_2, R.id.day_pill_2_4_2, R.id.day_pill_2_5_2, R.id.day_pill_2_6_2},
        {R.id.day_pill_3_0_2, R.id.day_pill_3_1_2, R.id.day_pill_3_2_2, R.id.day_pill_3_3_2, R.id.day_pill_3_4_2, R.id.day_pill_3_5_2, R.id.day_pill_3_6_2},
        {R.id.day_pill_4_0_2, R.id.day_pill_4_1_2, R.id.day_pill_4_2_2, R.id.day_pill_4_3_2, R.id.day_pill_4_4_2, R.id.day_pill_4_5_2, R.id.day_pill_4_6_2},
        {R.id.day_pill_5_0_2, R.id.day_pill_5_1_2, R.id.day_pill_5_2_2, R.id.day_pill_5_3_2, R.id.day_pill_5_4_2, R.id.day_pill_5_5_2, R.id.day_pill_5_6_2},
    };
    private static final int[][] NAME_A_IDS = {
        {R.id.day_name_0_0_1, R.id.day_name_0_1_1, R.id.day_name_0_2_1, R.id.day_name_0_3_1, R.id.day_name_0_4_1, R.id.day_name_0_5_1, R.id.day_name_0_6_1},
        {R.id.day_name_1_0_1, R.id.day_name_1_1_1, R.id.day_name_1_2_1, R.id.day_name_1_3_1, R.id.day_name_1_4_1, R.id.day_name_1_5_1, R.id.day_name_1_6_1},
        {R.id.day_name_2_0_1, R.id.day_name_2_1_1, R.id.day_name_2_2_1, R.id.day_name_2_3_1, R.id.day_name_2_4_1, R.id.day_name_2_5_1, R.id.day_name_2_6_1},
        {R.id.day_name_3_0_1, R.id.day_name_3_1_1, R.id.day_name_3_2_1, R.id.day_name_3_3_1, R.id.day_name_3_4_1, R.id.day_name_3_5_1, R.id.day_name_3_6_1},
        {R.id.day_name_4_0_1, R.id.day_name_4_1_1, R.id.day_name_4_2_1, R.id.day_name_4_3_1, R.id.day_name_4_4_1, R.id.day_name_4_5_1, R.id.day_name_4_6_1},
        {R.id.day_name_5_0_1, R.id.day_name_5_1_1, R.id.day_name_5_2_1, R.id.day_name_5_3_1, R.id.day_name_5_4_1, R.id.day_name_5_5_1, R.id.day_name_5_6_1},
    };
    private static final int[][] NAME_B_IDS = {
        {R.id.day_name_0_0_2, R.id.day_name_0_1_2, R.id.day_name_0_2_2, R.id.day_name_0_3_2, R.id.day_name_0_4_2, R.id.day_name_0_5_2, R.id.day_name_0_6_2},
        {R.id.day_name_1_0_2, R.id.day_name_1_1_2, R.id.day_name_1_2_2, R.id.day_name_1_3_2, R.id.day_name_1_4_2, R.id.day_name_1_5_2, R.id.day_name_1_6_2},
        {R.id.day_name_2_0_2, R.id.day_name_2_1_2, R.id.day_name_2_2_2, R.id.day_name_2_3_2, R.id.day_name_2_4_2, R.id.day_name_2_5_2, R.id.day_name_2_6_2},
        {R.id.day_name_3_0_2, R.id.day_name_3_1_2, R.id.day_name_3_2_2, R.id.day_name_3_3_2, R.id.day_name_3_4_2, R.id.day_name_3_5_2, R.id.day_name_3_6_2},
        {R.id.day_name_4_0_2, R.id.day_name_4_1_2, R.id.day_name_4_2_2, R.id.day_name_4_3_2, R.id.day_name_4_4_2, R.id.day_name_4_5_2, R.id.day_name_4_6_2},
        {R.id.day_name_5_0_2, R.id.day_name_5_1_2, R.id.day_name_5_2_2, R.id.day_name_5_3_2, R.id.day_name_5_4_2, R.id.day_name_5_5_2, R.id.day_name_5_6_2},
    };
    private static final int[][] TIME_A_IDS = {
        {R.id.day_time_0_0_1, R.id.day_time_0_1_1, R.id.day_time_0_2_1, R.id.day_time_0_3_1, R.id.day_time_0_4_1, R.id.day_time_0_5_1, R.id.day_time_0_6_1},
        {R.id.day_time_1_0_1, R.id.day_time_1_1_1, R.id.day_time_1_2_1, R.id.day_time_1_3_1, R.id.day_time_1_4_1, R.id.day_time_1_5_1, R.id.day_time_1_6_1},
        {R.id.day_time_2_0_1, R.id.day_time_2_1_1, R.id.day_time_2_2_1, R.id.day_time_2_3_1, R.id.day_time_2_4_1, R.id.day_time_2_5_1, R.id.day_time_2_6_1},
        {R.id.day_time_3_0_1, R.id.day_time_3_1_1, R.id.day_time_3_2_1, R.id.day_time_3_3_1, R.id.day_time_3_4_1, R.id.day_time_3_5_1, R.id.day_time_3_6_1},
        {R.id.day_time_4_0_1, R.id.day_time_4_1_1, R.id.day_time_4_2_1, R.id.day_time_4_3_1, R.id.day_time_4_4_1, R.id.day_time_4_5_1, R.id.day_time_4_6_1},
        {R.id.day_time_5_0_1, R.id.day_time_5_1_1, R.id.day_time_5_2_1, R.id.day_time_5_3_1, R.id.day_time_5_4_1, R.id.day_time_5_5_1, R.id.day_time_5_6_1},
    };
    private static final int[][] TIME_B_IDS = {
        {R.id.day_time_0_0_2, R.id.day_time_0_1_2, R.id.day_time_0_2_2, R.id.day_time_0_3_2, R.id.day_time_0_4_2, R.id.day_time_0_5_2, R.id.day_time_0_6_2},
        {R.id.day_time_1_0_2, R.id.day_time_1_1_2, R.id.day_time_1_2_2, R.id.day_time_1_3_2, R.id.day_time_1_4_2, R.id.day_time_1_5_2, R.id.day_time_1_6_2},
        {R.id.day_time_2_0_2, R.id.day_time_2_1_2, R.id.day_time_2_2_2, R.id.day_time_2_3_2, R.id.day_time_2_4_2, R.id.day_time_2_5_2, R.id.day_time_2_6_2},
        {R.id.day_time_3_0_2, R.id.day_time_3_1_2, R.id.day_time_3_2_2, R.id.day_time_3_3_2, R.id.day_time_3_4_2, R.id.day_time_3_5_2, R.id.day_time_3_6_2},
        {R.id.day_time_4_0_2, R.id.day_time_4_1_2, R.id.day_time_4_2_2, R.id.day_time_4_3_2, R.id.day_time_4_4_2, R.id.day_time_4_5_2, R.id.day_time_4_6_2},
        {R.id.day_time_5_0_2, R.id.day_time_5_1_2, R.id.day_time_5_2_2, R.id.day_time_5_3_2, R.id.day_time_5_4_2, R.id.day_time_5_5_2, R.id.day_time_5_6_2},
    };
    private static final int MAX_LABEL_LENGTH = 18;

    /**
     * Fills one of the 6 statically-embedded week rows. A null week (e.g. a
     * defensive carry-over with fewer rows) leaves blank cells.
     */
    private static void fillWeek(Context context, RemoteViews views, List<WidgetDay> week,
                                 int w, boolean expanded) {
        if (week == null) return;
        for (int c = 0; c < 7 && c < week.size(); c++) {
            try {
                fillCell(context, views, week.get(c), w, c, expanded);
            } catch (Exception ignored) {
            }
        }
    }

    private static void fillCell(Context context, RemoteViews views, WidgetDay day,
                                 int r, int c, boolean expanded) {
        int numberId = NUMBER_IDS[r][c];
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
            for (int dot : DOT_IDS[r][c]) views.setViewVisibility(dot, android.view.View.GONE);
            views.setViewVisibility(DOTS_CONTAINER_IDS[r][c], android.view.View.GONE);
            int eventCount = day.labels.size();
            for (int k = 0; k < 2; k++) {
                int labelId = DAY_LABEL_IDS[r][c][k];
                int pillId = (k == 0 ? PILL_A_IDS : PILL_B_IDS)[r][c];
                int nameId = (k == 0 ? NAME_A_IDS : NAME_B_IDS)[r][c];
                int timeId = (k == 0 ? TIME_A_IDS : TIME_B_IDS)[r][c];
                if ((k == 0 && eventCount > 0) || (k == 1 && eventCount > 2)) {
                    boolean isMore = (k == 1);
                    views.setViewVisibility(labelId, android.view.View.VISIBLE);
                    views.setViewVisibility(pillId, android.view.View.VISIBLE);
                    if (isMore) {
                        views.setInt(pillId, "setBackgroundResource",
                                R.drawable.calendar_widget_pill_more);
                        views.setTextViewText(nameId, "+" + (eventCount - 1) + " más");
                        views.setViewVisibility(timeId, android.view.View.GONE);
                        views.setTextColor(nameId,
                                context.getColor(R.color.widget_pill_more_text));
                    } else {
                        views.setInt(pillId, "setBackgroundResource",
                                R.drawable.calendar_widget_pill);
                        views.setTextViewText(nameId, shorten(day.labels.get(0)));
                        views.setTextViewText(timeId, formatTime(
                                day.times.size() > 0 ? day.times.get(0) : ""));
                        views.setViewVisibility(timeId, android.view.View.VISIBLE);
                        views.setTextColor(nameId, context.getColor(R.color.widget_today_text));
                    }
                } else if (k == 1 && eventCount == 2) {
                    views.setViewVisibility(labelId, android.view.View.VISIBLE);
                    views.setViewVisibility(pillId, android.view.View.VISIBLE);
                    views.setInt(pillId, "setBackgroundResource", R.drawable.calendar_widget_pill);
                    views.setTextViewText(nameId, shorten(day.labels.get(1)));
                    views.setTextViewText(timeId, formatTime(
                            day.times.size() > 1 ? day.times.get(1) : ""));
                    views.setViewVisibility(timeId, android.view.View.VISIBLE);
                    views.setTextColor(nameId, context.getColor(R.color.widget_today_text));
                } else {
                    views.setViewVisibility(labelId, android.view.View.GONE);
                    views.setViewVisibility(pillId, android.view.View.GONE);
                    views.setTextViewText(nameId, "");
                    views.setTextViewText(timeId, "");
                }
            }
        } else {
            for (int i = 0; i < DAY_LABEL_IDS.length; i++) {
                views.setViewVisibility(DAY_LABEL_IDS[i][r][c], android.view.View.GONE);
            }
            for (int k = 0; k < 3; k++) {
                int dotId = DOT_IDS[r][c][k];
                if (k < day.dotColors.size()) {
                    views.setViewVisibility(dotId, android.view.View.VISIBLE);
                    views.setInt(dotId, "setColorFilter", parseColor(day.dotColors.get(k)));
                } else {
                    views.setViewVisibility(dotId, android.view.View.GONE);
                }
            }
        }

        // Tapping a day opens the day view of the app directly.
        if (day.date != null && !day.date.isEmpty()) {
            views.setOnClickPendingIntent(CELL_IDS[r][c],
                    openAppIntent(context, 1000 + r * 8 + c,
                            "/calendario?view=day&date=" + Uri.encode(day.date)));
        }
    }

    /** Wrapper for the label containers (hidden in compact/dot mode). */
    private static final int[][][] DAY_LABEL_IDS = {
        {{R.id.day_label_0_0_1, R.id.day_label_0_0_2}, {R.id.day_label_0_1_1, R.id.day_label_0_1_2}, {R.id.day_label_0_2_1, R.id.day_label_0_2_2}, {R.id.day_label_0_3_1, R.id.day_label_0_3_2}, {R.id.day_label_0_4_1, R.id.day_label_0_4_2}, {R.id.day_label_0_5_1, R.id.day_label_0_5_2}, {R.id.day_label_0_6_1, R.id.day_label_0_6_2}},
        {{R.id.day_label_1_0_1, R.id.day_label_1_0_2}, {R.id.day_label_1_1_1, R.id.day_label_1_1_2}, {R.id.day_label_1_2_1, R.id.day_label_1_2_2}, {R.id.day_label_1_3_1, R.id.day_label_1_3_2}, {R.id.day_label_1_4_1, R.id.day_label_1_4_2}, {R.id.day_label_1_5_1, R.id.day_label_1_5_2}, {R.id.day_label_1_6_1, R.id.day_label_1_6_2}},
        {{R.id.day_label_2_0_1, R.id.day_label_2_0_2}, {R.id.day_label_2_1_1, R.id.day_label_2_1_2}, {R.id.day_label_2_2_1, R.id.day_label_2_2_2}, {R.id.day_label_2_3_1, R.id.day_label_2_3_2}, {R.id.day_label_2_4_1, R.id.day_label_2_4_2}, {R.id.day_label_2_5_1, R.id.day_label_2_5_2}, {R.id.day_label_2_6_1, R.id.day_label_2_6_2}},
        {{R.id.day_label_3_0_1, R.id.day_label_3_0_2}, {R.id.day_label_3_1_1, R.id.day_label_3_1_2}, {R.id.day_label_3_2_1, R.id.day_label_3_2_2}, {R.id.day_label_3_3_1, R.id.day_label_3_3_2}, {R.id.day_label_3_4_1, R.id.day_label_3_4_2}, {R.id.day_label_3_5_1, R.id.day_label_3_5_2}, {R.id.day_label_3_6_1, R.id.day_label_3_6_2}},
        {{R.id.day_label_4_0_1, R.id.day_label_4_0_2}, {R.id.day_label_4_1_1, R.id.day_label_4_1_2}, {R.id.day_label_4_2_1, R.id.day_label_4_2_2}, {R.id.day_label_4_3_1, R.id.day_label_4_3_2}, {R.id.day_label_4_4_1, R.id.day_label_4_4_2}, {R.id.day_label_4_5_1, R.id.day_label_4_5_2}, {R.id.day_label_4_6_1, R.id.day_label_4_6_2}},
        {{R.id.day_label_5_0_1, R.id.day_label_5_0_2}, {R.id.day_label_5_1_1, R.id.day_label_5_1_2}, {R.id.day_label_5_2_1, R.id.day_label_5_2_2}, {R.id.day_label_5_3_1, R.id.day_label_5_3_2}, {R.id.day_label_5_4_1, R.id.day_label_5_4_2}, {R.id.day_label_5_5_1, R.id.day_label_5_5_2}, {R.id.day_label_5_6_1, R.id.day_label_5_6_2}},
    };

    /** Ellipsizes a label to {@link #MAX_LABEL_LENGTH} chars. */
    static String shorten(String value) {
        if (value == null || value.isEmpty()) return "";
        if (value.length() <= MAX_LABEL_LENGTH) return value;
        return value.substring(0, MAX_LABEL_LENGTH - 1) + "…";
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