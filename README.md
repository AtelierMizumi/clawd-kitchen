# clawd-kitchen

A small pixel-art kitchen that lives above your Claude Code prompt. Clawd, the
orange Claude Code mascot, stands by the stove: breathing, blinking, glancing
at the pan and tapping a foot while steam rises from the pot.

> Unofficial fan project, not affiliated with Anthropic. See [NOTICE.md](NOTICE.md).

**Status: v0.1 in progress.** Idle, typing (chopping at a prep table you pull
over), thinking (browsing dishes on a phone and cooking them), simmering while the answer
streams, and cooking with Bash work. Serving, burnt-dish and sleeping poses,
sound, petting and a compact mode are being added one at a time, each only
once it looks and sounds right.

## Requirements

- **Claude Code** with plugin hooks (mods) support. Built and tested on 2.1.300.
- **A terminal with truecolor**: Konsole, kitty, WezTerm, Alacritty, GNOME
  Terminal, iTerm2, Windows Terminal.
- **At least about 57 columns.** In a narrower terminal the kitchen hides itself.
- **A font with proper braille glyphs.** Steam, sparkles and zzz are drawn with
  braille dots. See [Fonts](#fonts) below.

The kitchen draws in the terminal only. In the VS Code extension, the desktop
app and on the phone through Remote Control it does not show.

## Install

At the Claude Code prompt:

```
/plugin install clawd-kitchen --marketplace AtelierMizumi/clawd-kitchen
```

Answer `y` to add the marketplace, then pick a scope (user scope puts Clawd in
every session). Or from a shell:

```bash
claude plugin install clawd-kitchen --marketplace AtelierMizumi/clawd-kitchen
```

### From a local clone

```bash
git clone https://github.com/AtelierMizumi/clawd-kitchen.git
claude --plugin-dir ./clawd-kitchen
```

`--plugin-dir` loads it for that session only. To keep it, add the clone as a
marketplace and install from it:

```bash
claude plugin marketplace add ./clawd-kitchen
claude plugin install clawd-kitchen@clawd-kitchen
```

### Uninstall

```bash
claude plugin uninstall clawd-kitchen
```

## Fonts

Each terminal cell shows two square pixels with the half-block characters
`▀` `▄`, and effects use braille characters (U+2800–U+28FF). Almost every
monospace font has the half blocks. Braille is where fonts differ:

- **Good:** the font draws only the raised dots. Adwaita Mono, DejaVu Sans
  Mono, any Nerd Font (for example AtkynsonMono Nerd Font), Iosevka, JetBrains
  Mono, Cascadia Code.
- **Bad:** the font has no braille, so the terminal borrows it from a fallback
  that draws all eight dot positions, with the unraised ones as rings. Steam
  then looks like a pile of dotted boxes. FreeMono does this, and it is a
  common fallback on Linux when the main font is Noto Sans Mono or Hack.

Check yours:

```bash
printf '⡇ ⠅ ⣿ ⠁\n'
```

You should see a short bar, two dots, a full block of dots and a single dot.
Rings around them mean a fallback font is drawing them.

### Fix it

Either **set your terminal font** to one from the good list (Konsole:
Settings → Edit Current Profile → Appearance → Font), or **keep your font and
fix the fallback** with fontconfig (Linux):

```bash
mkdir -p ~/.config/fontconfig/conf.d
cat > ~/.config/fontconfig/conf.d/60-clawd-braille.conf <<'XML'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <!-- Your terminal font, then the font to borrow braille from. -->
  <match target="pattern">
    <test name="family" qual="any"><string>Hack</string></test>
    <edit name="family" mode="append" binding="weak"><string>Adwaita Mono</string></edit>
  </match>
</fontconfig>
XML
fc-cache -f
fc-match "Hack:charset=2847"   # should print Adwaita Mono
```

Replace `Hack` with your terminal font (KDE: System Settings → Fonts → Fixed
width) and `Adwaita Mono` with any installed font from the good list (Arch:
`pacman -S adwaita-fonts` or `ttf-dejavu`). Your terminal font itself does not
change; only the missing braille glyphs come from the other font. Restart the
terminal afterwards.

## Usage

Nothing to do: Clawd, in a chef hat, appears above the prompt when a session starts.

| What Clawd does | When |
|---|---|
| Breathes (the top of the body glows, arms lift on the inhale), blinks, glances at the pan, taps a foot | Idle |
| Pulls the prep table over from the left, then chops meat, cucumber and carrot; each slice hops onto a fanned pile | You are typing in the prompt |
| Scrolls through dishes on a phone in his left hand, with a bubble above it showing the dish; then tosses its ingredient into the pan (burger, egg) or the pot (ramen) with his right hand | Claude is thinking |
| Watches the pot, its lid rattling with steam squeezing out | The answer is streaming in |
| Tosses the pan over the flames | Claude runs a Bash command |

### Command

`/clawd` prints what Clawd currently sees, for example
`Clawd is in the simmer mood · answer text pieces: 42 · table: -9`. If Clawd
does not react while the answer streams, run it right after the answer: a
count of 0 means the mod was not told about the text.

Editing tools, serving the answer, a burnt dish on errors and sleeping are
recognised by the state machine but still draw the idle pose.

## Development

```bash
python3 tools/build.py          # sprites/*.txt + scenes.json → hooks/gen/data.ts
python3 -m pytest -q tests      # sprite format
claude plugin test .            # hooks logic
claude plugin validate .
python3 tools/gif.py typing 5400 60     # preview/out/typing.gif: <mood> [ms] [step], rendered by the mod's own code
```

`tools/gif.py` runs `tools/frames.ts` through `pnpm dlx tsx` and draws the
cells like a terminal does, so previews match what the mod shows.

Sprites are plain text in `sprites/`: `palette.txt` maps one character to one
colour, `.` is transparent, and `@frame <name>` starts each frame. Clawd is
assembled from parts (`clawd_body`, `clawd_arm`, `clawd_leg`, `clawd_eye`) by
`hooks/lib/clawd.ts`, so new poses need no new drawings.

To work on it with hot reload, run `claude --plugin-dir .` from the repo.

## License

MIT, see [LICENSE](LICENSE). Clawd and Claude are Anthropic's; see
[NOTICE.md](NOTICE.md).
