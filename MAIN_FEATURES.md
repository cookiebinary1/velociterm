# VelociTerm – MAIN_FEATURES

Tento dokument je **zdroj pravdy** pre kľúčové vlastnosti VelociTermu. Najmä špecifikuje, ako má fungovať „dočasné písanie“ (predictive input) – t. j. okamžité lokálne zobrazenie znakov, ktoré používateľ píše, aj keď vzdialený shell echo-ne so oneskorením.

## 1. Predictive Input (kľúčová vlastnosť)

### 1.1 Cieľ

- Pri písaní do terminálu sa znaky zobrazia **okamžite** (lokálne), aj keď server/PTY echo prichádza neskôr.
- Keď príde skutočný output zo servera, lokálne „predikované“ znaky sa **nahradia potvrdeným** textom bez rozbitia kurzora.
- V citlivých kontextoch (password/passphrase) sa predictive input **automaticky vypne** a nič sa „nedimuje“ ani neloguje.

### 1.2 Slovník

- **Predikované znaky / pending**: znaky, ktoré používateľ napísal a zobrazili sa lokálne, ale ešte neprišlo ich potvrdenie zo servera.
- **Potvrdený output**: text, ktorý prišiel z PTY (`pty-output`).
- **Reconcile (zosúladenie)**: logika, ktorá porovnáva pending vs. server output a rozhodne, či sa pending nahradí, skráti alebo úplne zruší.

### 1.3 Stavový model

Predictive input drží stav:

- `pending`: string – všetko, čo je zobrazené lokálne ako predikcia
- `cursorOffset`: number – koľko znakov je kurzor „dopredu“ kvôli pending
- `passwordMode`: boolean – bezpečnostný režim, v ktorom sa predikcia nevykonáva
- `recentOutput`: string – krátky buffer posledného outputu pre detekciu citlivého kontextu

### 1.4 Ako to má fungovať v praxi

#### A) Používateľ píše (lokálny input)

Flow:

1. xterm vyvolá `onData(data)`.
2. Pred odoslaním do PTY sa zavolá `predictInput(data)`.
3. Následne sa vždy zavolá `writeToPty(ptyId, data)`.

Správanie `predictInput(data)`:

- Predikujú sa **iba** jednoduché „printable“ ASCII znaky (`code 32..126`).
- Predikovaný text sa vykreslí v xterm s dim štýlom (ANSI „dim“).
- Pri `Backspace`:
  - ak existuje pending, odstráni sa posledný predikovaný znak (lokálne aj v stave)
  - ak pending neexistuje, predikcia do toho nezasahuje (server to vyrieši sám)
- Pri `Enter` (`\r` / `\n`): pending sa vyčistí (nepredikuje sa nový riadok)
- Pri `Escape` alebo iných control znakoch: pending sa vyčistí a predikcia sa nepoužije

Akceptačné kritérium:

- Pri vysokom oneskorení (napr. remote session) vidíš okamžite, čo píšeš.
- Predikované znaky sú vizuálne odlíšené (dim), aby bolo jasné, že ešte nie sú potvrdené.

#### B) Prichádza output zo servera (pty-output)

Flow:

1. Príde event `pty-output` s `data`.
2. Volá sa `reconcileOutput(serverData)`.

Správanie `reconcileOutput(serverData)`:

- Ak predictive input je vypnutý alebo `pending` je prázdny:
  - `serverData` sa iba zapíše do xterm
- Inak sa spočíta `matchLen` = dĺžka prefixu, ktorý sa zhoduje medzi `pending` a `serverData`.

Prípady:

- **Partial/full match (`matchLen > 0`)**:
  - lokálne predikované znaky sa vymažú (backspace/space/backspace)
  - `pending` sa skráti o `matchLen`
  - do xterm sa zapíše `serverData` (potvrdený output)
  - ak `pending` stále niečo obsahuje, znovu sa zobrazí dim verzia zvyšku

- **No match (`matchLen === 0`)**:
  - vymaže sa celé pending
  - pending sa v stave vynuluje
  - do xterm sa zapíše `serverData`

Akceptačné kritérium:

- Keď server začne echo-vať, dim znaky „prepnú“ na normálne bez rozhodenia kurzora.
- Ak server pošle niečo neočakávané (prompt, repaint, escape sekvencie), pending sa bezpečne zruší.

### 1.5 Bezpečnosť: Password/Passphrase režim

Predictive input sa **musí vypnúť automaticky**, keď sa deteguje citlivý kontext.

Detekcia:

- na základe `recentOutput` (strip ANSI + heuristiky)
- na základe viditeľných riadkov v xterm bufferi (hľadanie „password/passphrase…“)
- na základe chunku, ktorý práve prišiel (`serverData`)

Správanie v `passwordMode`:

- `predictInput` nič nezobrazuje
- ak používateľ stlačí Enter, password režim sa vypne a `recentOutput` sa resetne

Akceptačné kritérium:

- Pri výzve na heslo sa nikdy nezobrazuje dim predikcia.

### 1.6 Nastavenie

- V Settings musí existovať prepínač `predictiveInput` (viď sekcia 4.5 → Terminal).
- Ak používateľ vypne `predictiveInput`, všetky pending znaky sa okamžite vyčistia.

### 1.7 Obmedzenia (aktuálny scope)

- Predikujú sa len ASCII „printable“ znaky.
- Neimplementuje sa predikcia pre:
  - Unicode/IME
  - bracketed paste
  - komplexné escape sekvencie, cursor movement, redraw

## 2. PTY + Tabs (základné správanie)

- Každý tab má vlastné PTY (`ptyId`).
- `pty-output` sa routuje podľa `pty_id`.
- Pri `pty-exit` sa tab automaticky zavrie.

## 3. Keybindings a ukončenie aplikácie (high-level)

- Ukončenie aplikácie ide cez natívny macOS `Quit`.
- Ak je zapnuté `confirmCmdQ`, aplikácia najprv vyžiada potvrdenie a až potom ukončí.

### 3.1 Zoznam skratiek (požadované správanie)

- `Cmd+Q` – Quit
- `Cmd+C` – Copy textu z konzoly
- `Cmd+V` – Paste do konzoly
- `Cmd+D` – Split horizontal (nový panel v rámci tabu)
- `Cmd+Shift+D` – Split vertical (nový panel v rámci tabu)
- `Cmd+T` – Nový tab

### 3.2 Cmd+Q – Quit

Požiadavky:

- Skratka musí fungovať **spoľahlivo** aj vtedy, keď fokus je v xterm.
- Ak je `confirmCmdQ` zapnuté, pred ukončením sa zobrazí potvrdenie.
- Ak používateľ nepotvrdí, aplikácia zostane bežať.

Akceptačné kritérium:

- Stlačenie `Cmd+Q` vždy spustí quit flow.

### 3.3 Cmd+C – Copy textu z konzoly

Požiadavky:

- Ak má používateľ v xterm označený text, `Cmd+C` skopíruje **označený text** do clipboardu.
- Ak nie je nič označené, `Cmd+C` sa správa ako v bežnom termináli (posiela `SIGINT` / control sequence) – t. j. aplikácia nesmie „naslepo“ kradnúť `Cmd+C`.

Poznámka:

- Toto správanie typicky vyžaduje kombináciu:
  - xterm selection API (zistenie, či existuje selection)
  - natívny clipboard (Tauri) alebo natívne menu Copy

Akceptačné kritérium:

- Pri označení textu je `Cmd+C` vždy copy.
- Bez selection je `Cmd+C` vždy interrupt (nie copy).

### 3.4 Cmd+V – Paste do konzoly

Požiadavky:

- `Cmd+V` vloží text z clipboardu do aktívneho terminálu.
- Paste musí fungovať aj vtedy, keď WebView neumožní JS prístup ku clipboardu.

Akceptačné kritérium:

- Skopírujem text mimo appky a `Cmd+V` ho vloží do terminálu.

### 3.5 Cmd+D – Split horizontal

Požiadavky:

- V rámci aktuálneho tabu vytvorí nový panel (split) horizontálne.
- Aktívny zostane nový panel (focus v novom termináli).

Akceptačné kritérium:

- Po `Cmd+D` sú viditeľné 2 panely nad sebou (alebo podľa layoutu) a dá sa písať do nového.

### 3.6 Cmd+Shift+D – Split vertical

Požiadavky:

- V rámci aktuálneho tabu vytvorí nový panel (split) vertikálne.
- Aktívny zostane nový panel.

Akceptačné kritérium:

- Po `Cmd+Shift+D` sú viditeľné 2 panely vedľa seba a dá sa písať do nového.

### 3.7 Cmd+T – Nový tab

Požiadavky:

- Vytvorí nový tab s novým PTY.
- Nový tab sa stane aktívnym.

Akceptačné kritérium:

- Po `Cmd+T` pribudne tab a prompt je pripravený.

## 4. Settings (požiadavky UI/UX)

Táto sekcia definuje, čo má obsahovať Settings okno a ako sa má správať. Cieľ je, aby Settings boli:

- rýchle (bez reloadu UI)
- bezpečné (nemenia/nerušia terminálové session)
- predvídateľné (všetko sa prejaví okamžite a po reštarte ostane zachované)

### 4.0 Základný layout a ovládanie

Požiadavky:

- Settings je **overlay** nad aplikáciou (neprepína sa route a nezaniká terminal UI pod tým).
- Klik mimo panelu (na overlay) Settings zatvorí.
- Klik na `×` zatvorí.
- Pri zatváraní sa nastavenia uložia (persistencia cez config).
- Settings panel má sidebar s kategóriami:
  - Appearance
  - Terminal
  - Keybindings

Akceptačné kritérium:

- Otvorím Settings (`Cmd+,`), zmením hodnoty, zavriem → zmena ostane.
- Pri otvorených Settings stále beží PTY a taby sa nemenia.

### 4.1 Výber fontu (system fonts)

Požiadavky:

- V Settings musí byť možnosť nastaviť `fontFamily`.
- Výber ovplyvní xterm font (`fontFamily`) a prejaví sa okamžite.
- Preferované UX:
  - výber zo systémových fontov (picker/list)
  - + možnosť manuálneho text inputu ako fallback

Akceptačné kritérium:

- Zmena fontu sa prejaví okamžite na termináli.

### 4.2 Opacity (slider)

Požiadavky:

- V Settings bude slider pre priesvitnosť okna.
- Rozsah aspoň 50% až 100%.
- Zmena sa aplikuje okamžite na pozadie aplikácie.

Akceptačné kritérium:

- Pri posune slidera sa pozadie okna plynulo mení.

### 4.3 Blur (toggle + intenzita)

Požiadavky:

- V Settings musí byť ovládanie blur efektu:
  - `blur` toggle (zapnúť/vypnúť)
  - `blurRadius` (intenzita v px)
- Ak blur nie je podporovaný/platforma ho vypne, UI nesmie „rozbiť“ layout.

UX:

- Intenzita je slider (napr. 0–30px).
- Keď je `blur` vypnutý, slider intenzity je disabled (alebo vizuálne neaktívny).

Akceptačné kritérium:

- Pri zmene nastavenia sa blur prejaví bez rozbitia layoutu.
- Pri posune slidera sa intenzita blur mení plynulo.

### 4.4 Správanie pri otvorených Settings

Požiadavky:

- Keď je otvorené Settings overlay, obsah okna pod ním sa **nijak nemení**:
  - nezmizne terminál
  - nezmení sa layout
  - nezmení sa stav tabov/panels
- Settings je iba overlay (ako teraz).

### 4.5 Obsah Settings – položky podľa kategórie

#### Appearance

- **Theme**: výber témy (ovplyvní UI farby + terminal theme).
- **Window Opacity**: slider 50–100%.
- **Blur**: toggle + slider intenzity (px).
- **Font Family**: systémové fonty (ideálne) + fallback text input. Toto nech je select box.
- **Font Size**: slider (napr. 10–24).

#### Terminal

- **Scrollback**: počet riadkov histórie (napr. 1k–100k).
- **Cursor Style**: `block` | `underline` | `bar`.
- **Cursor Blink**: toggle.
- **Predictive Input**: toggle `predictiveInput`.
  - Ak používateľ vypne `predictiveInput`, všetky pending znaky sa okamžite vyčistia.
  - Má byť jasné, že ide o kľúčovú feature (vysvetlenie v 1–2 vetách).
- **Confirm Cmd+Q**: toggle `confirmCmdQ` (vyžiada potvrdenie pred quit).

#### Keybindings

- Sekcia je **read-only** (zatiaľ len prehľad).
- Zobrazuje najdôležitejšie skratky a ich popis (minimálne `Cmd+Q`, `Cmd+V`, `Cmd+T`, `Cmd+,`).

### 4.6 Persistencia (config)

Požiadavky:

- Pri štarte sa Settings načítajú z configu.
- Pri zatvorení Settings sa hodnoty uložia do configu.
- Všetky položky, ktoré používateľ vie zmeniť v UI, musia byť aj v persisted confige.

Akceptačné kritérium:

- Zmením `opacity` / `fontFamily` / `confirmCmdQ` → reštart aplikácie → hodnoty ostanú.

## 5. Priority & MVP (roadmap)

### 5.1 P0 (MVP – must-have)

- Predictive input (dočasné písmená pri písaní) funguje spoľahlivo podľa sekcie 1.
- PTY session sa vždy vytvorí (žiadne „Failed to create terminal session“ pri štarte).
- `Cmd+Q` quit flow funguje spoľahlivo (s potvrdením, ak je zapnuté `confirmCmdQ`).
- `Cmd+V` paste do konzoly funguje spoľahlivo.
- `Cmd+T` nový tab funguje (nové PTY, okamžitý fokus).

### 5.2 P1 (high value – ďalší krok)

- `Cmd+C`:
  - pri selection: copy
  - bez selection: nekradnúť (interrupt)
- Settings:
  - výber fontu zo systémových fontov
  - opacity slider
  - blur slider

- Splits v rámci tabu:
  - `Cmd+D` split horizontal
  - `Cmd+Shift+D` split vertical
- Dlhodobé UX/quality:
  - stabilný blur aj pri defocus (ak CSS nestačí, natívna vibrancy)

### 5.3 P2 (nice-to-have / neskôr)

- Settings:
  - font select box
  - predictive input toggle
  - confirm cmd+q toggle

### 5.4 Definícia “Done” pre MVP

- Po clean štarte aplikácie sa otvorí tab a je možné písať bez errorov.
- Pri simulovanom oneskorení echo (napr. `slow_pty.sh`) vidíš lokálne písanie okamžite a následne sa výstup korektne zosúladí.
- `Cmd+Q` a `Cmd+V` fungujú aj keď je fokus v termináli.

## 6. Debug/diagnostika (čo pozerať pri regresii predictive input)

Pri probléme typu „dočasné písmená sa nezobrazujú“ over:

1. Či sa volá `predictInput(data)` v `xterm.onData`.
2. Či `settings.predictiveInput` je `true` a `setEnabled(true)` bolo aplikované.
3. Či aplikácia nie je permanentne v `passwordMode` (heuristika môže byť príliš agresívna).
4. Či `reconcileOutput` dostáva output (event `pty-output`).

## 7. Definícia “Done” pre predictive input

- Pri simulovanom oneskorení echo (napr. `slow_pty.sh`) vidíš lokálne písanie okamžite.
- Keď echo príde, text sa potvrdí bez vizuálneho chaosu.
- Pri password promptoch sa predikcia vypne.
