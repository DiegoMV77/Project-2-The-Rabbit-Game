# Rabbit Run (Retro One-Button Game)

Simple retro-style browser game inspired by endless runner mechanics.

## Gameplay

- You are a pixel rabbit running across snowy terrain.
- Jump over rocks of different heights and spacing.
- Birds begin appearing later in the run and spawn only sometimes.
- The game gradually speeds up the farther you run.
- Reach the giant carrot to win.

## Controls

- `Space` to jump
- Left mouse click to jump

This is a one-button game.

## Run Locally

From the project root, start a local static server:

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`

## Files

- `index.html` page and UI shell
- `styles.css` retro visuals and layout
- `game.js` game loop, spawning, physics, collisions, and rendering