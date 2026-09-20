package com.diamondcalendar.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

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
        if (webView != null) {
            // The app shell is the deployed web. A stale WebView HTTP cache made
            // the installed APK show an older build than the browser — force the
            // cache off so every launch reflects the current deployment.
            webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            disableHistoryGestures(webView);
            relayExternalSchemes(webView);
        }
    }

    /**
     * WhatsApp (and other custom-scheme) links are app-to-app deep links, not
     * pages the WebView can render. server.allowNavigation is '*' so Capacitor
     * treats every host as in-app and never forwards these itself, and the
     * WebView fails with net::ERR_UNKNOWN_URL_SCHEME (e.g. the wa.me/api
     * interstitial's redirect to whatsapp://send/?phone=…). Relay custom
     * schemes to the OS instead; keep Capacitor/plugin handling in front.
     */
    private void relayExternalSchemes(WebView webView) {
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (super.shouldOverrideUrlLoading(view, request)) return true;
                if (relayWhatsAppDeepLink(view, request.getUrl())) return true;
                return launchExternalIfCustomScheme(view, request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (super.shouldOverrideUrlLoading(view, url)) return true;
                if (relayWhatsAppDeepLink(view, Uri.parse(url))) return true;
                return launchExternalIfCustomScheme(view, Uri.parse(url));
            }
        });
    }

    /**
     * wa.me / api.whatsapp.com links are WhatsApp's own deep-link hosts: convert
     * them straight to a whatsapp:// intent instead of loading the interstitial
     * in the WebView, so the calendar never gets replaced by (or left on) the
     * WhatsApp redirect page. Falls back to loading the gateway in-app when no
     * WhatsApp handler exists.
     */
    private boolean relayWhatsAppDeepLink(WebView view, Uri url) {
        String scheme = url.getScheme();
        String host = url.getHost();
        if (scheme == null || host == null) return false;
        scheme = scheme.toLowerCase();
        host = host.toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https")) return false;

        String phone = null;
        String text = null;
        if (host.equals("wa.me")) {
            String path = url.getPath();
            if (path == null || path.isEmpty()) return false;
            phone = path.replace("/", "");
            text = url.getQueryParameter("text");
        } else if (host.equals("api.whatsapp.com") && isSendPath(url.getPath())) {
            phone = url.getQueryParameter("phone");
            text = url.getQueryParameter("text");
            if (phone == null) return false;
        } else {
            return false;
        }

        Uri deepLink = new Uri.Builder()
                .scheme("whatsapp")
                .authority("send")
                .appendQueryParameter("phone", phone)
                .build();
        if (text != null && !text.isEmpty()) {
            deepLink = deepLink.buildUpon().appendQueryParameter("text", text).build();
        }
        try {
            Intent relay = new Intent(Intent.ACTION_VIEW, deepLink);
            relay.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getApplicationContext().startActivity(relay);
            return true;
        } catch (ActivityNotFoundException notFound) {
            view.loadUrl(url.toString());
            return true;
        }
    }

    private static boolean isSendPath(String path) {
        if (path == null) return false;
        return path.equals("/send") || path.equals("/send/");
    }

    private boolean launchExternalIfCustomScheme(WebView view, Uri url) {
        String scheme = url.getScheme();
        if (scheme == null) return false;
        scheme = scheme.toLowerCase();
        if (scheme.equals("http") || scheme.equals("https") || scheme.equals("about")
                || scheme.equals("data") || scheme.equals("blob") || scheme.equals("file")
                || scheme.equals("javascript") || scheme.equals("capacitor")) {
            return false; // real pages / internal — load in the WebView
        }
        try {
            Intent relay = new Intent(Intent.ACTION_VIEW, url);
            relay.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getApplicationContext().startActivity(relay);
            return true;
        } catch (ActivityNotFoundException noHandler) {
            // No app owns the scheme. For WhatsApp fall back to the web gateway
            // so the user still sees the chat / install screen instead of the
            // raw error.
            if (scheme.equals("whatsapp")) {
                view.loadUrl(whatsAppGateUrl(url));
                return true;
            }
            return false;
        }
    }

    private static String whatsAppGateUrl(Uri deepLink) {
        Uri.Builder gate = new Uri.Builder()
                .scheme("https")
                .authority("api.whatsapp.com")
                .path("send");
        String phone = deepLink.getQueryParameter("phone");
        gate.appendQueryParameter("phone", phone != null ? phone : "");
        String text = deepLink.getQueryParameter("text");
        if (text != null && !text.isEmpty()) gate.appendQueryParameter("text", text);
        return gate.build().toString();
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