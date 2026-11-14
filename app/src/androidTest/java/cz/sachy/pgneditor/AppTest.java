package cz.sachy.pgneditor;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Zkoušky na emulátoru Androidu. Ověřují to, co v prohlížeči zkoušet nejde: obal aplikace
 * (MainActivity), skutečný WebView, ukládání do paměti telefonu a práci se soubory.
 * Spouští se při sestavení na GitHubu: ./gradlew connectedDebugAndroidTest
 */
@RunWith(AndroidJUnit4.class)
public class AppTest {

    private static final String GAME = "[Event \"Zkouska\"]\n[White \"Novak, Jan\"]\n[Black \"Dvorak, Petr\"]\n[Result \"*\"]\n\n1. e4 e5 *\n";

    private final Context app = ApplicationProvider.getApplicationContext();
    private ActivityScenario<MainActivity> scenario;

    @After
    public void close() {
        if (scenario != null) scenario.close();
    }

    /* ---------- pomocné funkce ---------- */

    private ViewGroup root() {
        AtomicReference<ViewGroup> ref = new AtomicReference<>();
        scenario.onActivity(a -> ref.set((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)));
        return ref.get();
    }

    /** Spustí JavaScript ve stránce a vrátí výsledek (jako text JSON). */
    private String js(String code) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> out = new AtomicReference<>("");
        scenario.onActivity(a -> {
            WebView web = (WebView) ((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);
            web.evaluateJavascript("(function(){" + code + "})()", r -> { out.set(r); done.countDown(); });
        });
        assertTrue("stránka neodpověděla na: " + code, done.await(15, TimeUnit.SECONDS));
        return out.get();
    }

    /** Čeká, až podmínka ve stránce platí. Potvrzovací okno Otevřít (neuložené změny) mezitím odklepne. */
    private void waitFor(String what, String condition) throws Exception {
        long end = System.currentTimeMillis() + 40000;
        String last = "";
        while (System.currentTimeMillis() < end) {
            last = js("try { return !!(" + condition + "); } catch (e) { return 'chyba: ' + e.message; }");
            if ("true".equals(last)) return;
            js("var m = document.getElementById('modal'), ok = document.getElementById('modalOk');"
                    + "if (m && !m.hidden && ok && ok.textContent === 'Otevřít') ok.click(); return 0;");
            Thread.sleep(300);
        }
        throw new AssertionError("nedočkal jsem se: " + what + " (poslední stav " + last + "), stránka: "
                + js("return document.getElementById('fileInfo').textContent + ' | okno: ' + (document.getElementById('modal').hidden ? '' : document.getElementById('modalTitle').textContent + ': ' + document.getElementById('modalText').textContent);"));
    }

    private void waitBooted() throws Exception {
        waitFor("start aplikace", "window.Android && !document.body.classList.contains('booting') && document.querySelectorAll('#board .sq').length === 64");
    }

    private void openText(String pgn, String name) throws Exception {
        js("window.androidOpenText(" + JSONObject.quote(pgn) + "," + JSONObject.quote(name) + ",''); return 0;");
        waitFor("otevření " + name, "document.getElementById('fileInfo').textContent.indexOf(" + JSONObject.quote(name) + ") === 0");
    }

    private File shared(String name, byte[] data) throws Exception {
        File dir = new File(app.getCacheDir(), "odeslat");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File f = new File(dir, name);
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
        return f;
    }

    private Uri uriOf(File f) {
        return FileProvider.getUriForFile(app, app.getPackageName() + ".files", f);
    }

    private Intent viewIntent(File f) {
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setClass(app, MainActivity.class);
        i.setDataAndType(uriOf(f), "application/x-chess-pgn");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return i;
    }

    /* ---------- zkoušky ---------- */

    @Test
    public void startsAndShowsBoard() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        waitBooted();
        assertEquals("\"function\"", js("return typeof window.Android.saveToUri;"));
        assertEquals("\"function\"", js("return typeof window.PGN.parseFile;"));
        assertEquals("true", js("return !!window.indexedDB;"));
    }

    @Test
    public void contentIsNotUnderSystemBars() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        waitBooted();
        if (Build.VERSION.SDK_INT >= 30) {
            Thread.sleep(500);
            assertTrue("obsah má být odsazený pod stavový řádek", root().getPaddingTop() > 0);
        }
    }

    @Test
    public void moveSurvivesRestart() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        waitBooted();
        openText(GAME, "trvale.pgn");
        js("document.querySelector('[data-sq=\"g1\"]').click(); document.querySelector('[data-sq=\"f3\"]').click(); return 0;");
        waitFor("zapsaný tah", "document.getElementById('pgnText').value.indexOf('2. Nf3') !== -1");
        Thread.sleep(1500); // zápis do paměti telefonu
        scenario.recreate();
        waitBooted();
        waitFor("soubor po restartu", "document.getElementById('fileInfo').textContent.indexOf('trvale.pgn') === 0");
        waitFor("tah po restartu", "document.getElementById('pgnText').value.indexOf('2. Nf3') !== -1");
    }

    @Test
    public void opensPgnFromAnotherApp() throws Exception {
        File f = shared("zkouska.pgn", GAME.getBytes(StandardCharsets.UTF_8));
        scenario = ActivityScenario.launch(viewIntent(f));
        waitBooted();
        waitFor("otevření souboru z jiné aplikace", "document.getElementById('fileInfo').textContent.indexOf('zkouska.pgn') === 0");
        waitFor("jméno hráče", "document.getElementById('playerBottom').textContent.indexOf('Novak') !== -1");
    }

    @Test
    public void refusesFileThatIsNotPgn() throws Exception {
        byte[] png = new byte[400];
        byte[] head = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 13, 'I', 'H', 'D', 'R', '}', '{'};
        System.arraycopy(head, 0, png, 0, head.length);
        File f = shared("obrazek.png", png);
        scenario = ActivityScenario.launch(viewIntent(f));
        waitBooted();
        waitFor("hlášení o souboru, který není PGN",
                "!document.getElementById('modal').hidden && document.getElementById('modalTitle').textContent === 'Soubor nejde otevřít'");
    }

    @Test
    public void savesBackIntoFile() throws Exception {
        File f = shared("ulozit.pgn", GAME.getBytes(StandardCharsets.UTF_8));
        scenario = ActivityScenario.launch(MainActivity.class);
        waitBooted();
        String text = "[Event \"Ulozeno\"]\n\n1. d4 *\n";
        assertEquals("\"ok\"", js("return window.Android.saveToUri(" + JSONObject.quote(uriOf(f).toString()) + "," + JSONObject.quote(text) + ");"));
        assertEquals(text, new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
        assertNotEquals("\"ok\"", js("return window.Android.saveToUri('content://neexistuje.pgneditor/x.pgn', 'a');"));
    }

    @Test
    public void themeSwitchDoesNotBreakApp() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        waitBooted();
        js("window.Android.setTheme('dark'); return 0;");
        Thread.sleep(300);
        js("window.Android.setTheme('auto'); return 0;");
        assertEquals("auto", app.getSharedPreferences("app", Context.MODE_PRIVATE).getString("theme", ""));
        waitBooted();
    }
}
