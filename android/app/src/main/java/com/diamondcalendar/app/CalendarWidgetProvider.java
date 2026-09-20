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
 * The entire grid (header, weekday labels and every week row) is rendered as a
 * single static {@code RemoteViews} tree pushed with {@code updateAppWidget}.
 * No RemoteViewsService collection is involved, so launchers never show a
 * per-row "Loading..." placeholder that can stall — the launcher displays the
 * exact rows this provider pushed, and every refresh re-pushes the whole grid.
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
     * Most recent fetch result. {@link #refreshAsync} renders the full grid from
     * this, and on a failed re-fetch it keeps rendering the last good month so a
     * navigation tap or resize that hits a network/auth hiccup never blanks the
     * tiles out to the error placeholder.
     *
     * This is never overwritten with a failure.
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
     * and the full calendar grid rendered as static week rows. No RemoteViews
     * collection is used, so launchers never have a per-row "Loading..." phase
     * to stall on — the entire grid is one tree that updates atomically.
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
        } else {
            views.setTextViewText(R.id.widget_title, month.label);
            views.setViewVisibility(R.id.widget_today,
                    offset == 0 ? android.view.View.GONE : android.view.View.VISIBLE);
            int rowCount = Math.max(1, month.weeks.size());
            int[] heightsPx = rowHeightsPx(context, widgetId, rowCount);
            for (int w = 0; w < month.weeks.size(); w++) {
                RemoteViews row = buildWeekRow(context, month.weeks.get(w),
                        heightsPx[Math.min(w, heightsPx.length - 1)], expanded, 200 + w * 8);
                views.addView(R.id.widget_week_rows, row);
            }
        }

        return views;
    }

    private static final int[] CELL_IDS = {
            R.id.day_cell_0, R.id.day_cell_1, R.id.day_cell_2, R.id.day_cell_3,
            R.id.day_cell_4, R.id.day_cell_5, R.id.day_cell_6,
    };
    private static final int[] NUMBER_IDS = {
            R.id.day_number_0, R.id.day_number_1, R.id.day_number_2, R.id.day_number_3,
            R.id.day_number_4, R.id.day_number_5, R.id.day_number_6,
    };
    private static final int[][] DOT_IDS = {
            {R.id.day_dot_0_1, R.id.day_dot_0_2, R.id.day_dot_0_3},
            {R.id.day_dot_1_1, R.id.day_dot_1_2, R.id.day_dot_1_3},
            {R.id.day_dot_2_1, R.id.day_dot_2_2, R.id.day_dot_2_3},
            {R.id.day_dot_3_1, R.id.day_dot_3_2, R.id.day_dot_3_3},
            {R.id.day_dot_4_1, R.id.day_dot_4_2, R.id.day_dot_4_3},
            {R.id.day_dot_5_1, R.id.day_dot_5_2, R.id.day_dot_5_3},
            {R.id.day_dot_6_1, R.id.day_dot_6_2, R.id.day_dot_6_3},
    };
    private static final int[] DOTS_CONTAINER_IDS = {
            R.id.day_dots_0, R.id.day_dots_1, R.id.day_dots_2, R.id.day_dots_3,
            R.id.day_dots_4, R.id.day_dots_5, R.id.day_dots_6,
    };
    private static final int[] LABEL_1_IDS = {
            R.id.day_label_0_1, R.id.day_label_1_1, R.id.day_label_2_1, R.id.day_label_3_1,
            R.id.day_label_4_1, R.id.day_label_5_1, R.id.day_label_6_1,
    };
    private static final int[] LABEL_2_IDS = {
            R.id.day_label_0_2, R.id.day_label_1_2, R.id.day_label_2_2, R.id.day_label_3_2,
            R.id.day_label_4_2, R.id.day_label_5_2, R.id.day_label_6_2,
    };
    private static final int[] NAME_1_IDS = {
            R.id.day_name_0_1, R.id.day_name_1_1, R.id.day_name_2_1, R.id.day_name_3_1,
            R.id.day_name_4_1, R.id.day_name_5_1, R.id.day_name_6_1,
    };
    private static final int[] NAME_2_IDS = {
            R.id.day_name_0_2, R.id.day_name_1_2, R.id.day_name_2_2, R.id.day_name_3_2,
            R.id.day_name_4_2, R.id.day_name_5_2, R.id.day_name_6_2,
    };
    private static final int[] TIME_1_IDS = {
            R.id.day_time_0_1, R.id.day_time_1_1, R.id.day_time_2_1, R.id.day_time_3_1,
            R.id.day_time_4_1, R.id.day_time_5_1, R.id.day_time_6_1,
    };
    private static final int[] TIME_2_IDS = {
            R.id.day_time_0_2, R.id.day_time_1_2, R.id.day_time_2_2, R.id.day_time_3_2,
            R.id.day_time_4_2, R.id.day_time_5_2, R.id.day_time_6_2,
    };
    private static final int[] PILL_1_IDS = {
            R.id.day_pill_0_1, R.id.day_pill_1_1, R.id.day_pill_2_1, R.id.day_pill_3_1,
            R.id.day_pill_4_1, R.id.day_pill_5_1, R.id.day_pill_6_1,
    };
    private static final int[] PILL_2_IDS = {
            R.id.day_pill_0_2, R.id.day_pill_1_2, R.id.day_pill_2_2, R.id.day_pill_3_2,
            R.id.day_pill_4_2, R.id.day_pill_5_2, R.id.day_pill_6_2,
    };

    private static final int MAX_LABEL_LENGTH = 18;

    /** Builds one 7-cell week row as a static RemoteViews. */
    private static RemoteViews buildWeekRow(Context context, List<WidgetDay> week,
                                            int rowHeightPx, boolean expanded, int cellBase) {
        RemoteViews row = new RemoteViews(context.getPackageName(),
                R.layout.calendar_widget_week_row);
        if (rowHeightPx > 0) {
            try {
                row.setInt(R.id.widget_week_row, "setMinimumHeight", rowHeightPx);
            } catch (Exception ignored) {
            }
        }
        for (int c = 0; c < 7 && c < week.size(); c++) {
            try {
                fillCell(context, row, week.get(c), c, expanded, cellBase + c);
            } catch (Exception ignored) {
            }
        }
        return row;
    }

    private static void fillCell(Context context, RemoteViews row, WidgetDay day, int c,
                                 boolean expanded, int requestCode) {
        int numberId = NUMBER_IDS[c];
        if (day == null) {
            row.setViewVisibility(numberId, android.view.View.INVISIBLE);
            return;
        }

        row.setTextViewText(numberId, String.valueOf(day.day));
        int textColor = day.inMonth
                ? context.getColor(R.color.widget_day_text)
                : context.getColor(R.color.widget_day_dim);
        if (day.isToday) {
            row.setInt(numberId, "setBackgroundResource", R.drawable.calendar_widget_today_bg);
            textColor = context.getColor(R.color.widget_today_text);
        }
        row.setTextColor(numberId, textColor);

        if (expanded) {
            for (int dot : DOT_IDS[c]) row.setViewVisibility(dot, android.view.View.GONE);
            row.setViewVisibility(DOTS_CONTAINER_IDS[c], android.view.View.GONE);
            int eventCount = day.labels.size();
            for (int k = 0; k < 2; k++) {
                int labelId = (k == 0 ? LABEL_1_IDS : LABEL_2_IDS)[c];
                int pillId = (k == 0 ? PILL_1_IDS : PILL_2_IDS)[c];
                int nameId = (k == 0 ? NAME_1_IDS : NAME_2_IDS)[c];
                int timeId = (k == 0 ? TIME_1_IDS : TIME_2_IDS)[c];
                if ((k == 0 && eventCount > 0) || (k == 1 && eventCount > 2)) {
                    boolean isMore = (k == 1);
                    row.setViewVisibility(labelId, android.view.View.VISIBLE);
                    row.setViewVisibility(pillId, android.view.View.VISIBLE);
                    if (isMore) {
                        // A busy day collapses every event after the first
                        // into a "+N más" chip so pills never run together.
                        row.setInt(pillId, "setBackgroundResource",
                                R.drawable.calendar_widget_pill_more);
                        row.setTextViewText(nameId, "+" + (eventCount - 1) + " más");
                        row.setViewVisibility(timeId, android.view.View.GONE);
                        row.setTextColor(nameId,
                                context.getColor(R.color.widget_pill_more_text));
                    } else {
                        row.setInt(pillId, "setBackgroundResource",
                                R.drawable.calendar_widget_pill);
                        row.setTextViewText(nameId, shorten(day.labels.get(0)));
                        row.setTextViewText(timeId, formatTime(
                                day.times.size() > 0 ? day.times.get(0) : ""));
                        row.setViewVisibility(timeId, android.view.View.VISIBLE);
                        row.setTextColor(nameId, context.getColor(R.color.widget_today_text));
                    }
                } else if (k == 1 && eventCount == 2) {
                    row.setViewVisibility(labelId, android.view.View.VISIBLE);
                    row.setViewVisibility(pillId, android.view.View.VISIBLE);
                    row.setInt(pillId, "setBackgroundResource", R.drawable.calendar_widget_pill);
                    row.setTextViewText(nameId, shorten(day.labels.get(1)));
                    row.setTextViewText(timeId, formatTime(
                            day.times.size() > 1 ? day.times.get(1) : ""));
                    row.setViewVisibility(timeId, android.view.View.VISIBLE);
                    row.setTextColor(nameId, context.getColor(R.color.widget_today_text));
                } else {
                    row.setViewVisibility(labelId, android.view.View.GONE);
                    row.setViewVisibility(pillId, android.view.View.GONE);
                    row.setTextViewText(nameId, "");
                    row.setTextViewText(timeId, "");
                }
            }
        } else {
            for (int label : new int[]{LABEL_1_IDS[c], LABEL_2_IDS[c]}) {
                row.setViewVisibility(label, android.view.View.GONE);
            }
            for (int k = 0; k < 3; k++) {
                int dotId = DOT_IDS[c][k];
                if (k < day.dotColors.size()) {
                    row.setViewVisibility(dotId, android.view.View.VISIBLE);
                    row.setInt(dotId, "setColorFilter", parseColor(day.dotColors.get(k)));
                } else {
                    row.setViewVisibility(dotId, android.view.View.GONE);
                }
            }
        }

        // Tapping a day opens the day view of the app directly.
        if (day.date != null && !day.date.isEmpty()) {
            row.setOnClickPendingIntent(CELL_IDS[c],
                    openAppIntent(context, requestCode,
                            "/calendario?view=day&date=" + Uri.encode(day.date)));
        }
    }

    /**
     * Distributes the week rows so they exactly fill the launcher-reported
     * footprint: every row gets availablePx / rowCount, and the remainder is
     * absorbed by the last row so there is never an empty band below the grid.
     */
    private static int[] rowHeightsPx(Context context, int widgetId, int rowCount) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            Bundle opts = manager.getAppWidgetOptions(widgetId);
            float height = sizeFor(context, widgetId, KEY_SIZE_H);
            if (height <= 0) height = optSize(opts, AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT);
            float width = sizeFor(context, widgetId, KEY_SIZE_W);
            if (width <= 0) width = optSize(opts, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
            if (height <= 0) {
                int fallback = (int) dpToPx(context, 44);
                int[] rows = new int[rowCount];
                java.util.Arrays.fill(rows, fallback);
                return rows;
            }
            int chromeDp = 82; // nav header + weekday labels + divider approx
            int availableDp = Math.max(1, (int) height - chromeDp);
            int count = Math.max(1, rowCount);
            int target = availableDp / count;
            boolean portrait = height > width;
            int rowDp = portrait
                    ? Math.max(40, Math.min(160, target))
                    : Math.max(32, Math.min(76, target));
            int rowPx = (int) dpToPx(context, rowDp);
            int[] rows = new int[rowCount];
            java.util.Arrays.fill(rows, rowPx);
            int total = availableDp * (int) context.getResources().getDisplayMetrics().density;
            if (rowCount > 0) rows[rowCount - 1] =
                    Math.max(rowPx, total - rowPx * (rowCount - 1));
            return rows;
        } catch (Exception e) {
            int fallback = (int) dpToPx(context, 44);
            int[] rows = new int[Math.max(1, rowCount)];
            java.util.Arrays.fill(rows, fallback);
            return rows;
        }
    }

    private static float dpToPx(Context context, float dp) {
        return dp * context.getResources().getDisplayMetrics().density;
    }

    private static String shorten(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        if (trimmed.length() <= MAX_LABEL_LENGTH) return trimmed;
        return trimmed.substring(0, MAX_LABEL_LENGTH);
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