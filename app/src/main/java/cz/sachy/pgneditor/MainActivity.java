package cz.sachy.pgneditor;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/**
 * Celá aplikace je webová stránka v assets/www/index.html zobrazená ve WebView.
 * Tahle třída jen doplňuje to, co stránka sama v Androidu neumí:
 * výběr souboru, uložení .pgn, schránku, odeslání e-mailem a tlačítko Zpět.
 * Stránka s ní mluví přes objekt window.Android.
 */
public class MainActivity extends Activity {

    private static final int REQ_OPEN = 1;
    private static final int REQ_SAVE = 2;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSaveText;
    private boolean pageLoaded;
    private String pendingOpenText, pendingOpenName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.bg));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // localStorage: rozehraná partie a nastavení
        s.setAllowContentAccess(true);  // čtení vybraného souboru PGN

        web.addJavascriptInterface(new Bridge(), "Android");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                deliverOpen();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
                // Odkazy ven (mailto: apod.) otevře příslušná aplikace
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*"); // soubory .pgn nemají v Androidu vlastní typ, proto nabízíme vše
                try {
                    startActivityForResult(i, REQ_OPEN);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        web.loadUrl("file:///android_asset/www/index.html");
        // Po otočení obrazovky nebo změně motivu se stejný soubor znovu neotevírá
        if (savedInstanceState == null) handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    /** Soubor nebo text poslaný z jiné aplikace předá stránce k otevření. */
    @SuppressWarnings("deprecation")
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        String text = null;
        if (Intent.ACTION_VIEW.equals(action)) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri == null) text = intent.getStringExtra(Intent.EXTRA_TEXT);
        } else return;
        String name = "";
        try {
            if (uri != null) {
                text = readText(uri);
                name = displayName(uri);
                if ("soubor PGN".equals(name) && uri.getLastPathSegment() != null) name = uri.getLastPathSegment();
            }
        } catch (Exception e) {
            text = null;
        }
        if (text == null || text.trim().isEmpty()) {
            pendingOpenText = null;
            Toast.makeText(this, "Soubor se nepodařilo přečíst.", Toast.LENGTH_LONG).show();
            return;
        }
        pendingOpenText = text;
        pendingOpenName = name;
        deliverOpen();
    }

    private void deliverOpen() {
        if (!pageLoaded || pendingOpenText == null) return;
        String js = "window.androidOpenText && window.androidOpenText(" + JSONObject.quote(pendingOpenText) + "," + JSONObject.quote(pendingOpenName == null ? "" : pendingOpenName) + ")";
        pendingOpenText = null;
        web.evaluateJavascript(js, null);
    }

    /** Přečte soubor jako UTF-8, a když to nejde, jako windows-1250 (starší soubory s češtinou). */
    private String readText(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
                if (buf.size() > 20 * 1024 * 1024) throw new Exception("soubor je příliš velký");
            }
            byte[] bytes = buf.toByteArray();
            try {
                return StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(bytes)).toString();
            } catch (CharacterCodingException e) {
                return new String(bytes, Charset.forName("windows-1250"));
            }
        }
    }

    /** Zpět nejdřív zavře otevřené okno ve stránce, teprve potom aplikaci. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.androidBack ? window.androidBack() : false", result -> {
            if (!"true".equals(result)) finish();
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;

        if (requestCode == REQ_OPEN) {
            if (fileCallback != null) fileCallback.onReceiveValue(uri != null ? new Uri[]{uri} : null);
            fileCallback = null;

        } else if (requestCode == REQ_SAVE) {
            String text = pendingSaveText;
            pendingSaveText = null;
            if (uri == null || text == null) { saved(false, ""); return; }
            try {
                OutputStream out;
                try { out = getContentResolver().openOutputStream(uri, "wt"); }
                catch (Exception e) { out = getContentResolver().openOutputStream(uri, "w"); }
                if (out == null) throw new Exception("soubor nelze otevřít");
                try (OutputStream o = out) { o.write(text.getBytes(StandardCharsets.UTF_8)); }
                saved(true, displayName(uri));
            } catch (Exception e) {
                saved(false, e.getMessage() != null ? e.getMessage() : "neznámá chyba");
            }
        }
    }

    private void saved(boolean ok, String name) {
        web.evaluateJavascript("window.onAndroidSaved && window.onAndroidSaved(" + ok + "," + JSONObject.quote(name) + ")", null);
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { }
        return "soubor PGN";
    }

    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return n.isEmpty() ? "partie.pgn" : n;
    }

    /** Metody volané ze stránky (běží mimo hlavní vlákno). */
    private class Bridge {

        @JavascriptInterface
        public void copy(String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = getSystemService(ClipboardManager.class);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("PGN", text));
            });
        }

        @JavascriptInterface
        public void saveFile(String fileName, String text) {
            runOnUiThread(() -> {
                pendingSaveText = text;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                // Obecný typ, aby Android k názvu nic nepřidával a koncovka zůstala .pgn
                i.setType("application/octet-stream");
                i.putExtra(Intent.EXTRA_TITLE, safeName(fileName));
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (ActivityNotFoundException e) {
                    pendingSaveText = null;
                    saved(false, "v telefonu chybí výběr umístění souboru");
                }
            });
        }

        @JavascriptInterface
        public String sendEmail(String to, String subject, String body, String fileName, String pgn) {
            try {
                File dir = new File(getCacheDir(), "odeslat");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("nelze připravit přílohu");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File file = new File(dir, safeName(fileName));
                try (FileOutputStream o = new FileOutputStream(file)) { o.write(pgn.getBytes(StandardCharsets.UTF_8)); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", file);

                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("application/octet-stream");
                boolean hasTo = to != null && !to.trim().isEmpty();
                if (hasTo) send.putExtra(Intent.EXTRA_EMAIL, new String[]{to.trim()});
                send.putExtra(Intent.EXTRA_SUBJECT, subject);
                send.putExtra(Intent.EXTRA_TEXT, body);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri("", uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (hasTo) {
                    // S adresou nabídnout jen poštovní aplikace
                    send.setSelector(new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")));
                    try {
                        startActivity(send);
                        return "ok";
                    } catch (ActivityNotFoundException e) {
                        send.setSelector(null);
                    }
                }
                // Bez adresy (nebo bez poštovní aplikace) obecné sdílení Androidu
                startActivity(Intent.createChooser(send, "Poslat partii"));
                return "ok";
            } catch (Exception e) {
                return e.getMessage() != null ? e.getMessage() : "neznámá chyba";
            }
        }
    }
}
