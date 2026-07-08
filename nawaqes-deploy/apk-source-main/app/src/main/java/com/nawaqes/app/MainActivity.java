package com.nawaqes.app;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import android.view.KeyEvent;
import android.view.WindowManager;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String START_URL = "https://safwatkhokha-nawaqes.hf.space";
    private ValueCallback<Uri[]> filePathCallback;
    private AuthBridge authBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED, WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);

        // 🔧 CRITICAL: Request camera + microphone permissions at runtime
        // (Android 6+ requires runtime permission requests for CAMERA and
        // RECORD_AUDIO). Without this, getUserMedia in the WebView fails
        // silently and live streaming shows "جاري البدء..." forever.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String[] perms = {
                android.Manifest.permission.CAMERA,
                android.Manifest.permission.RECORD_AUDIO,
                android.Manifest.permission.MODIFY_AUDIO_SETTINGS,
            };
            java.util.List<String> needed = new java.util.ArrayList<>();
            for (String p : perms) {
                if (checkSelfPermission(p) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    needed.add(p);
                }
            }
            if (!needed.isEmpty()) {
                requestPermissions(needed.toArray(new String[0]), 200);
            }
        }

        webView = new WebView(this);
        setContentView(webView);

        // Register JS↔Java bridge for FCM token registration
        authBridge = new AuthBridge(this);
        webView.addJavascriptInterface(authBridge, "AndroidAuthBridge");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("https://safwatkhokha-nawaqes.hf.space") || url.startsWith("nawaqes://")) {
                    return false;
                }
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(intent);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Inject a small JS hook that calls AuthBridge.onLogin() when
                // the user logs in. The hook reads the JWT from localStorage
                // and the Firebase config from /api/notifications/firebase-config.
                view.evaluateJavascript(
                    "(function() {" +
                    "  if (window._nawaqesFcmHook) return;" +
                    "  window._nawaqesFcmHook = true;" +
                    "  function tryRegister() {" +
                    "    try {" +
                    "      var jwt = localStorage.getItem('token') || localStorage.getItem('jwt') || '';" +
                    "      if (!jwt) return;" +
                    "      // Fetch Firebase config from the server" +
                    "      fetch('/api/notifications/firebase-config').then(function(r){return r.json();}).then(function(cfg){" +
                    "        if (window.AndroidAuthBridge && cfg.apiKey) {" +
                    "          window.AndroidAuthBridge.onLogin(jwt, JSON.stringify(cfg));" +
                    "        }" +
                    "      }).catch(function(e){ console.warn('FCM config fetch failed:', e); });" +
                    "    } catch(e) { console.warn('FCM hook error:', e); }" +
                    "  }" +
                    "  // Try once on page load" +
                    "  tryRegister();" +
                    "  // Re-try when localStorage changes (e.g. after login)" +
                    "  window.addEventListener('storage', tryRegister);" +
                    "  // Periodically retry (covers SPA navigations where storage event doesn't fire)" +
                    "  setInterval(tryRegister, 30000);" +
                    "})();",
                    null);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // 🔧 CRITICAL: Grant ALL permission requests (camera, mic, etc.)
                // for getUserMedia to work in the WebView. Without this, live
                // streaming (which calls navigator.mediaDevices.getUserMedia)
                // fails silently with "جاري البدء..." stuck forever.
                runOnUiThread(() -> {
                    try {
                        request.grant(request.getResources());
                    } catch (Exception e) {
                        // Some Android versions throw if grant is called twice
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, 100);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == 100 && filePathCallback != null) {
            if (resultCode == RESULT_OK && data != null) {
                filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            } else {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = null;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
