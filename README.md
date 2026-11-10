# Einkaufsliste v2.0.0
PWA (HTML/JS) · GitHub Pages · Firebase (Google-Anmeldung, Firestore mit Offline-Speicher)

## Einrichtung (einmalig)
1. https://console.firebase.google.com → Projekt hinzufügen (Google Analytics aus).
2. Build → Authentication → Anmeldemethode → **Google** aktivieren. Unter Einstellungen → Autorisierte Domains die GitHub-Pages-Domain ergänzen (z. B. `andi2019x-dotcom.github.io`).
3. Build → Firestore Database → Datenbank erstellen (Produktionsmodus, Region `eur3` / europe-west). Reiter **Regeln**: Inhalt von `firestore.rules` einfügen → Veröffentlichen.
4. Projekteinstellungen → Allgemein → „Web-App hinzufügen“ (</>) → die `firebaseConfig`-Werte (apiKey, authDomain, projectId, appId) in `config.js` eintragen.
5. Dateien (ohne `firestore.rules`/README nötig, schaden aber nicht) in das GitHub-Repo laden, Pages aktivieren.
6. Jede Person öffnet die URL, „Mit Google anmelden“, „Zum Startbildschirm hinzufügen“.

Zugriff haben nur die 4 Mailadressen in `firestore.rules`. Weitere Personen: dort ergänzen und neu veröffentlichen.

## Neue Version
`VERSION`/`BUILD_DATE`/`CHANGELOG` in `app.js` und `V` in `sw.js` erhöhen, hochladen. Daten liegen in Firestore bzw. im lokalen Firestore-Cache und bleiben bei Updates erhalten.

## Technik
- Jeder Eintrag = eigenes Dokument (`items`), Änderungen feldweise (`update`) → parallele Änderungen an verschiedenen Einträgen/Feldern gehen nicht verloren; am selben Feld gewinnt die letzte Änderung.
- Offline-Änderungen werden dauerhaft vorgemerkt (Firestore-Persistenz) und nach Verbindung automatisch übertragen.
- Löschen = `deletedAt` setzen (Papierkorb). Endgültiges Löschen erlaubt die Regel erst nach 30 Tagen (`request.time`), Ausführung beim App-Start.
- Tageszettel: Dokument-ID `bereich_JJJJ-MM-TT` (Zeitzone Europe/Berlin), Anlage beim ersten Öffnen am Tag; keine Doppelten möglich (nur `create` erlaubt).
- Bekannt: Tageszettel entsteht erst, wenn jemand die App öffnet (leere Zettel ohne Nutzung wären ohnehin leer).
