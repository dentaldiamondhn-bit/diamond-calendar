package com.diamondcalendar.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

/**
 * Supplies the six week rows of the calendar widget as a {@link RemoteViews}
 * collection. Because the launcher is the one that attaches the adapter, it
 * ALWAYS re-queries this service for the visible rows when it rebuilds the
 * widget (page switches, process/launcher recreation, rotation) instead of
 * depending on the last {@code RemoteViews} we pushed — which is what was being
 * dropped and leaving the tiles blank on the stock launcher.
 */
public class MonthWidgetService extends RemoteViewsService {

    private static final String TAG = "CalendarWidget";

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new WeekFactory(getApplicationContext(), intent);
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

    private static final int MAX_LABEL_LENGTH = 18;

    static class WeekFactory implements RemoteViewsService.RemoteViewsFactory {

        private final Context context;
        private final int widgetId;
        private List<List<CalendarWidgetProvider.WidgetDay>> weeks = new ArrayList<>();
        private boolean expanded;
        private int rowHeightPx;

        WeekFactory(Context context, Intent intent) {
            this.context = context;
            this.widgetId = intent.getIntExtra(
                    AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }

        @Override
        public void onCreate() {
        }

        @Override
        public void onDataSetChanged() {
            // Pull whatever the provider fetched most recently. This is invoked
            // by the launcher on every re-render, so the grid is always current
            // even when the launcher never re-applied our RemoteViews.
            CalendarWidgetProvider.WidgetMonth month = CalendarWidgetProvider.LAST_MONTH;
            weeks = (month != null && !month.weeks.isEmpty())
                    ? month.weeks
                    : new ArrayList<>();
            SharedPreferences prefs = context.getSharedPreferences(
                    CalendarWidgetProvider.PREFS, Context.MODE_PRIVATE);
            expanded = prefs.getBoolean("expanded_" + widgetId, false);
            rowHeightPx = computeRowHeightPx();
        }

        /**
         * Makes the week rows fill the launcher-provided widget footprint evenly
         * (portrait vs landscape, compact vs expanded), instead of stacking the
         * fixed 40dp rows and leaving an empty band at the bottom or crushing
         * the event tags on squat landscape footprints.
         */
        private int computeRowHeightPx() {
            try {
                AppWidgetManager manager = AppWidgetManager.getInstance(context);
                Bundle opts = manager.getAppWidgetOptions(widgetId);
                float heightDp = optSize(opts, AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT);
                if (heightDp <= 0) {
                    return (int) (dpToPx(expanded ? 52 : 40));
                }
                int headerDp = 82; // nav header + weekday labels + divider approx
                int availableDp = Math.max(1, (int) heightDp - headerDp);
                int count = Math.max(1, weeks.size());
                int minDp = expanded ? 46 : 30;
                int maxDp = expanded ? 76 : 46;
                int rowDp = Math.max(minDp, Math.min(maxDp, availableDp / count));
                return (int) dpToPx(rowDp);
            } catch (Exception e) {
                return (int) dpToPx(expanded ? 52 : 40);
            }
        }

        private float optSize(Bundle options, String key) {
            if (options == null || !options.containsKey(key)) return 0f;
            Object value = options.get(key);
            if (value instanceof Number) return ((Number) value).floatValue();
            try {
                return Float.parseFloat(String.valueOf(value));
            } catch (Exception ignored) {
                return 0f;
            }
        }

        private float dpToPx(float dp) {
            return dp * context.getResources().getDisplayMetrics().density;
        }

        @Override
        public int getCount() {
            return weeks.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= weeks.size()) return null;
            List<CalendarWidgetProvider.WidgetDay> week = weeks.get(position);
            RemoteViews row = new RemoteViews(context.getPackageName(),
                    R.layout.calendar_widget_week_row);
            if (rowHeightPx > 0) {
                try {
                    row.setInt(R.id.widget_week_row, "setMinimumHeight", rowHeightPx);
                } catch (Exception ignored) {
                }
            }
            for (int c = 0; c < 7 && c < week.size(); c++) {
                fillCell(row, week.get(c), c);
            }
            return row;
        }

        private void fillCell(RemoteViews row, CalendarWidgetProvider.WidgetDay day, int c) {
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
                for (int k = 0; k < 2; k++) {
                    int labelId = (k == 0 ? LABEL_1_IDS : LABEL_2_IDS)[c];
                    int nameId = (k == 0 ? NAME_1_IDS : NAME_2_IDS)[c];
                    int timeId = (k == 0 ? TIME_1_IDS : TIME_2_IDS)[c];
                    row.setViewVisibility(labelId, android.view.View.VISIBLE);
                    boolean has = k < day.labels.size();
                    if (has) {
                        row.setTextViewText(nameId, shorten(day.labels.get(k)));
                        row.setTextViewText(timeId, CalendarWidgetProvider.formatTime(
                                day.times.size() > k ? day.times.get(k) : ""));
                        row.setViewVisibility(nameId, android.view.View.VISIBLE);
                        row.setViewVisibility(timeId, android.view.View.VISIBLE);
                    } else {
                        row.setTextViewText(nameId, "");
                        row.setTextViewText(timeId, "");
                        row.setViewVisibility(nameId, android.view.View.GONE);
                        row.setViewVisibility(timeId, android.view.View.GONE);
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
                        row.setInt(dotId, "setColorFilter", CalendarWidgetProvider.parseColor(
                                day.dotColors.get(k)));
                    } else {
                        row.setViewVisibility(dotId, android.view.View.GONE);
                    }
                }
            }

            // Tapping an empty/unknown date falls back to the list template (opens the
            // app) instead of launching a broken day view.
            if (day.date != null && !day.date.isEmpty()) {
                row.setOnClickFillInIntent(CELL_IDS[c], new Intent()
                        .putExtra(CalendarWidgetProvider.EXTRA_WIDGET_PATH,
                                "/calendario?view=day&date=" + Uri.encode(day.date)));
            }
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }

        @Override
        public void onDestroy() {
        }
    }

    private static String shorten(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        if (trimmed.length() <= MAX_LABEL_LENGTH) return trimmed;
        return trimmed.substring(0, MAX_LABEL_LENGTH);
    }
}