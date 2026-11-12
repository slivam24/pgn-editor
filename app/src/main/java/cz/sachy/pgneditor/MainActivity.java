package cz.sachy.pgneditor;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/**
 * Celá aplikace je webová stránka v assets/www/index.html zobrazená ve WebView.
 * Tahle třída jen doplňuje to, co stránka sama v Androidu neumí:
 * výběr souboru, uložení .pgn, schránku, odeslání e-mailem a tlačítko Zpět.
 * Stránka s ní mluví přes objekt window.Android.
 */
public class MainActivity extends Activity {

    // Soubory aplikace se načítají z vnitřní zabezpečené adresy (https), aby mohl běžet šachový motor.
    // Adresa nikam na internet nevede, požadavky na ni obslouží shouldInterceptRequest ze složky assets.
    private static final String HOST = "appassets.androidplatform.net";
    private static final String BASE = "https://" + HOST + "/";
    private static final String START_URL = BASE + "www/index.html";
    private static final String OLD_URL = "file:///android_asset/www/index.html";

    private static final int REQ_OPEN = 1;
    private static final int REQ_SAVE = 2;
    private static final int REQ_MIC = 3;
    private static final int REQ_CAMERA = 4;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private byte[] pendingSaveBytes;
    private SpeechRecognizer recognizer;
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
                if (url == null || !url.startsWith(BASE)) return;
                pageLoaded = true;
                deliverOpen();
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.contains("..")) return notFound();
                if (path.startsWith("/")) path = path.substring(1);
                try {
                    InputStream in = getAssets().open(path);
                    String mime = mimeFor(path);
                    WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") ? "UTF-8" : null, in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    r.setResponseHeaders(h);
                    return r;
                } catch (IOException e) {
                    return notFound();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme()) || HOST.equals(u.getHost())) return false;
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
                boolean images = false;
                for (String t : params.getAcceptTypes()) if (t != null && t.startsWith("image/")) images = true;
                try {
                    if (images && params.isCaptureEnabled()) {
                        // Partie z fotky: rovnou fotoaparát, fotka se uloží do mezipaměti aplikace
                        File dir = new File(getCacheDir(), "foto");
                        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("nelze připravit fotku");
                        File[] old = dir.listFiles();
                        if (old != null) for (File f : old) f.delete();
                        File file = new File(dir, "partiar-" + System.currentTimeMillis() + ".jpg");
                        cameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", file);
                        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivityForResult(cam, REQ_CAMERA);
                        return true;
                    }
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    if (images) {
                        // Partie z fotky: fotky a PDF, i víc najednou
                        i.setType("*/*");
                        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "application/pdf"});
                        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                    } else {
                        i.setType("*/*"); // soubory .pgn nemají v Androidu vlastní typ, proto nabízíme vše
                    }
                    startActivityForResult(i, REQ_OPEN);
                    return true;
                } catch (ActivityNotFoundException | IOException | IllegalArgumentException e) {
                    fileCallback = null;
                    cameraUri = null;
                    return false;
                }
            }
        });

        // Starší verze ukládaly data pod adresou file://. Při prvním spuštění je stránka
        // na staré adrese předá (migrateStorage) a pak se aplikace načte z nové adresy.
        boolean migrated = getSharedPreferences("app", MODE_PRIVATE).getBoolean("migrated", false);
        web.loadUrl(migrated ? START_URL : OLD_URL);
        // Po otočení obrazovky nebo změně motivu se stejný soubor znovu neotevírá
        if (savedInstanceState == null) handleIntent(getIntent());
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopListening();
        web.onPause(); // stránka dostane zprávu, že je skrytá, a rozbor motorem se zastaví
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) { recognizer.destroy(); recognizer = null; }
        super.onDestroy();
    }

    /* ---------- Hlasové zadávání ---------- */

    private void js(String code) {
        web.evaluateJavascript(code, null);
    }

    private void startListening() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            js("window.onVoiceError && window.onVoiceError(100)");
            return;
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { js("window.onVoiceState && window.onVoiceState('listening')"); }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rmsdB) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { js("window.onVoiceState && window.onVoiceState('processing')"); }
                @Override public void onError(int error) { js("window.onVoiceError && window.onVoiceError(" + error + ")"); }
                @Override public void onPartialResults(Bundle partialResults) { }
                @Override public void onEvent(int eventType, Bundle params) { }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    JSONArray arr = new JSONArray();
                    if (list != null) for (String s : list) arr.put(s);
                    js("window.onVoiceResult && window.onVoiceResult(" + JSONObject.quote(arr.toString()) + ")");
                }
            });
        }
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "cs-CZ");
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        try {
            recognizer.startListening(i);
        } catch (Exception e) {
            js("window.onVoiceError && window.onVoiceError(5)");
        }
    }

    private void stopListening() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) { }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_MIC) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) startListening();
        else js("window.onVoiceError && window.onVoiceError(9)");
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
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
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                ClipData clip = data.getClipData();
                result = new Uri[clip.getItemCount()];
                for (int k = 0; k < result.length; k++) result[k] = clip.getItemAt(k).getUri();
            } else if (uri != null) result = new Uri[]{uri};
            if (fileCallback != null) fileCallback.onReceiveValue(result);
            fileCallback = null;

        } else if (requestCode == REQ_CAMERA) {
            if (fileCallback != null) fileCallback.onReceiveValue(resultCode == RESULT_OK && cameraUri != null ? new Uri[]{cameraUri} : null);
            fileCallback = null;
            cameraUri = null;

        } else if (requestCode == REQ_SAVE) {
            byte[] bytes = pendingSaveBytes;
            pendingSaveBytes = null;
            if (uri == null || bytes == null) { saved(false, ""); return; }
            try {
                OutputStream out;
                try { out = getContentResolver().openOutputStream(uri, "wt"); }
                catch (Exception e) { out = getContentResolver().openOutputStream(uri, "w"); }
                if (out == null) throw new Exception("soubor nelze otevřít");
                try (OutputStream o = out) { o.write(bytes); }
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

        /** Stránka na staré adrese předá uložená data, pak se načte nová adresa. */
        @JavascriptInterface
        public void migrateStorage(String json) {
            getSharedPreferences("app", MODE_PRIVATE).edit()
                    .putString("migrated_data", json)
                    .putBoolean("migrated", true)
                    .apply();
            runOnUiThread(() -> web.loadUrl(START_URL));
        }

        /** Stránka na nové adrese si jednou vyzvedne přenesená data. */
        @JavascriptInterface
        public String takeMigratedStorage() {
            SharedPreferences p = getSharedPreferences("app", MODE_PRIVATE);
            String d = p.getString("migrated_data", null);
            if (d != null) p.edit().remove("migrated_data").apply();
            return d;
        }

        @JavascriptInterface
        public void copy(String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = getSystemService(ClipboardManager.class);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("PGN", text));
            });
        }

        @JavascriptInterface
        public void saveFile(String fileName, String text) {
            // Obecný typ, aby Android k názvu nic nepřidával a koncovka zůstala .pgn
            saveBytes(fileName, text.getBytes(StandardCharsets.UTF_8), "application/octet-stream");
        }

        @JavascriptInterface
        public void saveBase64(String fileName, String base64, String mime) {
            saveBytes(fileName, Base64.decode(base64, Base64.DEFAULT), mime);
        }

        private void saveBytes(String fileName, byte[] data, String mime) {
            runOnUiThread(() -> {
                pendingSaveBytes = data;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, safeName(fileName));
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (ActivityNotFoundException e) {
                    pendingSaveBytes = null;
                    saved(false, "v telefonu chybí výběr umístění souboru");
                }
            });
        }

        /** Sdílení obrázku pozice (PNG) do jiné aplikace. */
        @JavascriptInterface
        public String shareImage(String fileName, String base64) {
            try {
                File dir = new File(getCacheDir(), "odeslat");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("nelze připravit obrázek");
                File file = new File(dir, safeName(fileName));
                try (FileOutputStream o = new FileOutputStream(file)) { o.write(Base64.decode(base64, Base64.DEFAULT)); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", file);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri("", uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(send, "Sdílet obrázek pozice"));
                return "ok";
            } catch (Exception e) {
                return e.getMessage() != null ? e.getMessage() : "neznámá chyba";
            }
        }

        /** Krátká vibrace po tahu. */
        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = getSystemService(Vibrator.class);
            if (v == null || !v.hasVibrator()) return;
            v.vibrate(VibrationEffect.createOneShot(Math.max(5, Math.min(ms, 200)), VibrationEffect.DEFAULT_AMPLITUDE));
        }

        /** Hlasové zadávání: jedno poslechnutí, výsledek přijde do window.onVoiceResult. */
        @JavascriptInterface
        public void voiceStart() {
            runOnUiThread(MainActivity.this::startListening);
        }

        @JavascriptInterface
        public void voiceStop() {
            runOnUiThread(MainActivity.this::stopListening);
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
