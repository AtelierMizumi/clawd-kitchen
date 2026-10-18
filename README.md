# clawd-kitchen

A small pixel-art kitchen that lives above your Claude Code prompt. Clawd, the
orange Claude Code mascot (drawn exactly as Claude Code draws him in its header, at
twice the size), stands between a prep table and a stove, in a chef hat: breathing,
blinking, glancing at the table and the pot, while steam rises from the pot.

> Unofficial fan project, not affiliated with Anthropic. See [NOTICE.md](NOTICE.md).

**Status: v0.2 in progress.** The kitchen has two stages. **v3**, the default, is
animated the way an animator times it (24 frames a second, each drawing held for a
whole number of frames, squash and stretch, a hat that floats and lands) and has
every mood: idle, typing (every key is a chop), thinking, simmering while the answer
streams, stirring on Bash, seasoning on edits, serving, a burnt pot on error and
sleeping. **v2**, the earlier 80 ms kitchen, is still there as `/clawd v2`. Sound,
petting and a compact mode are being added one at a time, each only once it looks
and sounds right.

## Requirements

- **Claude Code** with plugin hooks (mods) support. Built and tested on 2.1.300.
- **A terminal with truecolor**: Konsole, kitty, WezTerm, Alacritty, GNOME
  Terminal, iTerm2, Windows Terminal.
- **At least 80 columns** for v3. In a narrower terminal the v2 kitchen is shown
  instead (about 57 columns), and below that nothing.
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

Each terminal cell shows a 2×2 block of pixels with the quadrant characters
`▘▝▖▗▀▄▌▐▚▞▛▜▙▟█` (U+2596–U+259F and the half blocks), and effects use braille
characters (U+2800–U+28FF). Almost every monospace font has the block
elements. Braille is where fonts differ:

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
| Breathes (the head rises half a model pixel, the hat pressed by it and floating on a beat), blinks, glances at the pot or the table, and now and then hops or stretches | Idle |
| Notices the prep table at the left, steps over and tugs it to the board in two tugs; then **every key is a chop**: he jumps with the knife, strikes, and a slice flies onto the pile. Typing fast gives quick chops, every fourth chop (or a paste) is a power chop, and with no keys he holds the knife ready, then puts it down | You are typing in the prompt |
| Holds up a phone with its screen scrolling, his eyes on it, and a comic thought bubble grows over his hat: two small bubbles, a cloud, and three dots coming one at a time | Claude is thinking |
| Stirs the pot slowly, bubbles popping, steam rising, content | The answer is streaming in |
| Stirs fast, leaning into it, the soup spitting | Claude runs a Bash command |
| Shakes a shaker four times over the pot, flakes falling into the soup, then a happy flourish | Claude edits or writes a file |
| Crouches, springs up and holds a plate high (a roast, a salad or a cake, in turn) with sparkles and a floating hat, then bows | An answer is served |
| Coughs three times, fanning the smoke from a burnt pot with his arms | Claude errors or refuses |
| Yawns, stretches, slumps, and breathes slowly while Zs float up | Quiet for five minutes |

### Commands

`/clawd` prints what Clawd currently sees and how fast the band is redrawn, for example
`Clawd is in the simmer mood · answer text pieces: 42 · table: -9 · v3 stage: last 240 redraw gaps, median 21 ms, longest 45 ms`.
If Clawd does not react while the answer streams, run it right after the answer: a
count of 0 means the mod was not told about the text. `/clawd v2` switches to the
earlier kitchen for the session's state, `/clawd v3` back.

## Development

```bash
python3 tools/build.py          # sprites/*.txt, sprites/v3/*.txt → hooks/gen/data.ts, hooks/gen/v3.ts
python3 -m pytest -q tests      # sprite format (anchors, @scale, @shade, two-colour check)
claude plugin test .            # hooks logic
claude plugin validate .
npx -y -p typescript@5.6.3 tsc -p . --noEmit

# v3 previews, rendered by the mod's own code (V3_ASKS, V3_LEAVE, V3_MOOD choose what plays)
V3_ASKS="0,67,68,69" python3 tools/v3_gif.py sheet "chop:67:16" preview/out/chop.png
V3_MOOD=thinking python3 tools/v3_gif.py gif 0 120 preview/out/thinking.gif
pnpm dlx tsx@4.19.2 tools/v3_live.ts 30     # plays the stage in this terminal at 24 fps
```

The v3 stage is 160×32 pixels (80 cells by 16 rows). Claude Code accepts only
code points in the Basic Multilingual Plane, so quadrants are the finest
blocks available (sextants and octants would be refused). Every terminal cell shows
one foreground and one background colour, so the art is drawn to keep each cell to
two: props in 2×2 blocks (`@scale 2`, with `@shade` to light the top edge and
darken the bottom edge of each block), Clawd on the model Claude Code draws.
`hooks/v3.*.test.ts` check that on every frame of every mood.

Sprites are plain text: `palette.txt` maps one character to one colour, `.` is
transparent, `@frame <name>` starts each frame, `@anchor` marks the points parts
attach to. v3 timing is in `hooks/v3/time.ts` (exposure sheets and spacing charts),
the rig in `hooks/v3/clawd.ts`, the idle, typing (`chop.ts`) and turn moods
(`moods.ts`) are pure functions of frames, and `hooks/v3/stage.ts` draws them. The
design is in `docs/superpowers/specs/2026-10-18-anime-timing-typing-design.md`. v2 lives
in `hooks/lib/` and `sprites/*.txt`, with previews through `tools/gif.py` and
`tools/strip.py`.

To work on it with hot reload, run `claude --plugin-dir .` from the repo.

## License

MIT, see [LICENSE](LICENSE). Clawd and Claude are Anthropic's; see
[NOTICE.md](NOTICE.md).
