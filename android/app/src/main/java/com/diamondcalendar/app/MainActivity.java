package com.diamondcalendar.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

import java.lang.reflect.Method;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android's default back press would finish the activity (close the app),
        // but this WebView is allowed to navigate to other origins (the Diamond
        // Link monolith, e.g. patient profile). Instead of closing, walk the
        // WebView history back so the user returns to the calendar.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        handleWidgetIntent(getIntent());
    }

    @Override
    protected void load() {
        super.load();
        // The calendar navigates by horizontal swipes; keep Android WebView's
        // edge-swipe back/forward history gesture from stealing those touches.
        // (setAllowBackForwardNavigationGestures is a hidden framework API.)
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView != null) disableHistoryGestures(webView);
    }

    @SuppressWarnings("JavaReflectionMemberAccess")
    private static void disableHistoryGestures(WebView webView) {
        if (webView == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        try {
            Method m = WebView.class.getMethod("setAllowBackForwardNavigationGestures", boolean.class);
            m.invoke(webView, false);
        } catch (Throwable ignored) {
            // Gesture nav support is best-effort; swipes still work in the page.
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWidgetIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Keep the launcher widget in sync whenever the app (re)opens, so it
        // reflects the latest session and appointments.
        Intent refresh = new Intent(this, CalendarWidgetProvider.class)
                .setAction(CalendarWidgetProvider.ACTION_REFRESH);
        sendBroadcast(refresh);
    }

    /** App widget taps arrive as an ACTION_VIEW intent carrying the target path. */
    private void handleWidgetIntent(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra(CalendarWidgetProvider.EXTRA_WIDGET_PATH);
        if (path == null || path.isEmpty()) return;
        intent.removeExtra(CalendarWidgetProvider.EXTRA_WIDGET_PATH);

        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        navigateTo(path);
    }

    private void navigateTo(String path) {
        String url = "https://calendario.dentaldiamondhn.com" + path;
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
    }
}