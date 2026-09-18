package com.diamondcalendar.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Home-launcher widget showing today's clinic appointments.
 *
 * Auth reuses the Clerk session cookie ({@code __session}) that the Capacitor
 * WebView already stores for the app origin — no extra token plumbing needed.
 * The widget fetches {@code /api/widget/overview} (cookie-authenticated) and,
 * on tap, deep-links into the calendar for the selected day/event.
 */
public class CalendarWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "CalendarWidget";
    private static final String BASE_URL = "https://calendario.dentaldiamondhn.com";

    public static final String ACTION_REFRESH = "com.diamondcalendar.app.WIDGET_REFRESH";
    public static final String EXTRA_WIDGET_PATH = "widget_path";

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private static final int[] ROW_IDS = {
            R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4,
    };
    private static final int[] TIME_IDS = {
            R.id.widget_row1_time, R.id.widget_row2_time, R.id.widget_row3_time, R.id.widget_row4_time,
    };
    private static final int[] TEXT_IDS = {
            R.id.widget_row1_text, R.id.widget_row2_text, R.id.widget_row3_text, R.id.widget_row4_text,
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        refreshAsync(context, appWidgetManager, appWidgetIds);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, CalendarWidgetProvider.class));
            refreshAsync(context, manager, ids);
        }
    }

    private void refreshAsync(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null || ids.length == 0) return;
        final Context appContext = context.getApplicationContext();
        final String cookies = readCookies();
        EXECUTOR.execute(() -> {
            WidgetOverview overview = null;
            String error = null;
            if (cookies == null) {
                error = "Abre la app para sincronizar";
            } else {
                try {
                    overview = fetchOverview(cookies);
                } catch (Exception e) {
                    Log.w(TAG, "widget fetch failed: " + e.getMessage());
                    error = "Toca para abrir la app";
                }
            }
            RemoteViews views = buildViews(appContext, overview, error);
            for (int id : ids) {
                manager.updateAppWidget(id, views);
            }
        });
    }

    /** Reads the app-origin cookies from the WebView cookie store (main thread). */
    private static String readCookies() {
        try {
            CookieManager manager = CookieManager.getInstance();
            String cookies = manager.getCookie(BASE_URL);
            if (cookies == null || cookies.isEmpty()) return null;
            // Clerk only needs the session cookie, but sending the whole jar for
            // the app origin is robust against renamed/suffixed session cookies.
            return cookies;
        } catch (Exception e) {
            Log.w(TAG, "cookie read failed: " + e.getMessage());
        }
        return null;
    }

    private static WidgetOverview fetchOverview(String cookies) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(BASE_URL + "/api/widget/overview");
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

            WidgetOverview overview = new WidgetOverview();
            JSONObject json = new JSONObject(body);
            overview.date = json.optString("date", "");
            overview.userName = json.optString("userName", "");
            JSONArray array = json.optJSONArray("events");
            if (array != null) {
                for (int i = 0; i < array.length(); i++) {
                    JSONObject item = array.getJSONObject(i);
                    WidgetEvent event = new WidgetEvent();
                    event.id = item.optLong("id", 0);
                    event.title = item.optString("title", "");
                    event.patientName = item.optString("patient_name", "");
                    event.startTime = item.optString("start_time", "");
                    event.endTime = item.optString("end_time", "");
                    event.color = item.optString("color", "");
                    overview.events.add(event);
                }
            }
            return overview;
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

    private static RemoteViews buildViews(Context context, WidgetOverview overview, String error) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.calendar_widget_layout);

        // Whole-widget tap → open the calendar.
        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context, 0, "/calendario"));
        views.setOnClickPendingIntent(R.id.widget_open_all, openAppIntent(context, 1, "/calendario"));

        if (error != null) {
            for (int id : ROW_IDS) views.setViewVisibility(id, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_empty, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_error, android.view.View.VISIBLE);
            views.setTextViewText(R.id.widget_error, error);
            views.setTextViewText(R.id.widget_date, "Diamond Calendar");
            return views;
        }

        int count = overview == null ? 0 : overview.events.size();
        String greeting = (overview != null && overview.userName != null && !overview.userName.isEmpty())
                ? "Hola, " + overview.userName
                : "Hoy";
        views.setTextViewText(R.id.widget_title, "Diamond Calendar");
        views.setTextViewText(R.id.widget_date, greeting + " · " + shortDate(overview == null ? "" : overview.date));

        // Rows
        for (int i = 0; i < ROW_IDS.length; i++) {
            if (overview != null && i < overview.events.size()) {
                WidgetEvent event = overview.events.get(i);
                views.setViewVisibility(ROW_IDS[i], android.view.View.VISIBLE);
                views.setTextViewText(TIME_IDS[i], formatTime(event.startTime));
                views.setTextViewText(TEXT_IDS[i], rowLabel(event));
                String path = "/calendario?view=day&date=" + Uri.encode(overview.date)
                        + "&eventId=" + event.id;
                views.setOnClickPendingIntent(ROW_IDS[i], openAppIntent(context, 10 + i, path));
            } else {
                views.setViewVisibility(ROW_IDS[i], android.view.View.GONE);
            }
        }

        if (count == 0) {
            views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE);
            views.setTextViewText(R.id.widget_empty, "Sin citas hoy");
            views.setViewVisibility(R.id.widget_error, android.view.View.GONE);
        } else {
            views.setViewVisibility(R.id.widget_empty, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_error, android.view.View.GONE);
        }

        return views;
    }

    private static String rowLabel(WidgetEvent event) {
        String title = event.title != null ? event.title.trim() : "";
        String patient = event.patientName != null ? event.patientName.trim() : "";
        if (!title.isEmpty() && !patient.isEmpty() && !title.equalsIgnoreCase(patient)) {
            return title + " · " + patient;
        }
        if (!patient.isEmpty()) return patient;
        if (!title.isEmpty()) return title;
        return "Cita";
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

    private static String shortDate(String isoDate) {
        if (isoDate == null || isoDate.length() < 10) return "";
        try {
            int month = Integer.parseInt(isoDate.substring(5, 7));
            String day = isoDate.substring(8, 10);
            String[] months = {"ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"};
            if (month >= 1 && month <= 12) {
                return Integer.parseInt(day) + " " + months[month - 1];
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private static String formatTime(String value) {
        if (value == null || value.isEmpty()) return "";
        String[] parts = value.split(":");
        if (parts.length < 2) return value;
        try {
            int hour = Integer.parseInt(parts[0]);
            String minute = parts[1].length() >= 2 ? parts[1].substring(0, 2) : "00";
            int h12 = hour % 12 == 0 ? 12 : hour % 12;
            String suffix = hour >= 12 ? "p.m." : "a.m.";
            return h12 + ":" + minute + " " + suffix;
        } catch (Exception e) {
            return value;
        }
    }

    /** Minimal POJOs (kept static to avoid extra files). */
    private static class WidgetOverview {
        String date = "";
        String userName = "";
        final java.util.List<WidgetEvent> events = new java.util.ArrayList<>();
    }

    private static class WidgetEvent {
        long id;
        String title = "";
        String patientName = "";
        String startTime = "";
        String endTime = "";
        String color = "";
    }
}