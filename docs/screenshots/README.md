# Screenshots

Captured from a real run of the app — no mockups.

## How to regenerate

```bash
cd expo-app
npx expo export --platform web   # builds dist/
python -m http.server 8901 --directory dist
# then with Playwright (mobile viewport 390x844):
# feed = initial route; other tabs via bottom tab bar buttons:
# 'Reels', 'Direct messages, 1 unread', 'Search and explore', 'Your profile'
```

Seed data uses `https://picsum.photos` images, so shots vary slightly run to
run. Keep the viewport at 390x844 (mobile) for consistency with the README
table.

## Files

- `feed.png` — home feed with stories row + posts
- `reels.png` — full-screen reels viewer
- `messages.png` — Direct: notes, contacts, threads
- `search.png` — search + discover people
- `profile.png` — profile grid, highlights, stats
