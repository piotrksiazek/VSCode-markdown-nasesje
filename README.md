# Markdown NaSesje Preview

Rozszerzenie do VSCode / Cursor z podglądem Markdown z obsługą LaTeX (KaTeX), kolorowych dyrektyw i synchronizacją zaznaczenia.

## Funkcje

- Podgląd Markdown z renderowaniem LaTeX (`$...$` i `$$...$$`) przez KaTeX
- Kolorowe dyrektywy: `:red[tekst]`, `:blue[tekst]`, `:purple[tekst]`
- Podświetlanie składni bloków kodu (highlight.js, motyw Night Owl)
- Tabele GFM (GitHub Flavored Markdown)
- Obsługa surowego HTML w Markdown
- **Dwukierunkowa synchronizacja zaznaczenia:**
  - Zaznaczenie w edytorze → podświetlenie w podglądzie
  - Kliknięcie w podglądzie → zaznaczenie odpowiedniego bloku w edytorze

## Instalacja

### Wymagania

- Node.js ≥ 18
- VSCode, Cursor lub Antigravity

### Kroki

```bash
# 1. Klonuj repozytorium
git clone <url> ~/Desktop/VSCode-markdown-nasesje
cd ~/Desktop/VSCode-markdown-nasesje

# 2. Zainstaluj zależności
npm install

# 3. Zbuduj rozszerzenie
npm run build

# 4. Zainstaluj — wybierz swój edytor:

# Cursor (symlink):
ln -sf "$(pwd)" ~/.cursor/extensions/nasesje.markdown-nasesje-0.0.1

# VSCode (symlink):
# ln -sf "$(pwd)" ~/.vscode/extensions/nasesje.markdown-nasesje-0.0.1

# Antigravity (wymaga instalacji przez .vsix):
# npx vsce package --no-dependencies --allow-missing-repository --skip-license
# /Applications/Antigravity.app/Contents/Resources/app/bin/antigravity --install-extension markdown-nasesje-0.0.1.vsix

# 5. Przeładuj edytor
# Cmd+Shift+P → "Developer: Reload Window"
```

## Użycie

1. Otwórz plik `.md`
2. **Cmd+Shift+P** → **"NaSesje: Open Markdown Preview"**
   - Lub skrót: **Cmd+Shift+N** (na macOS)
3. Panel podglądu otworzy się obok edytora

## Rozwój

```bash
# Tryb watch — automatyczny rebuild przy zmianach
npm run watch

# Po zmianach przeładuj okno edytora:
# Cmd+Shift+P → "Developer: Reload Window"
```
