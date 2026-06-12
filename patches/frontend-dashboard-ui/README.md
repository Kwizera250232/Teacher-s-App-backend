# Frontend dashboard UI patch

These files mirror changes for [Teacher-s-App-frontent](https://github.com/Kwizera250232/Teacher-s-App-frontent). Copy them into your frontend repo `src/` tree (or run the apply script from the backend repo root).

## What changed

- **C. Status (teacher):** Removed inline “C. Status” blocks from School and Tools tabs. The mobile toolbar button opens a modal only.
- **Teacher dashboard:** Standard class cards and apps panel (not WhatsApp-style). Parent invites stay on the main Classes tab and toolbar.
- **Chats tab:** WhatsApp styling kept only for staff ↔ parent messaging.
- **Classmates (student):** WhatsApp-style rows on the home dashboard and inside each class’s Classmates tab, with avatars from `GET /classes/:id/classmates`.

## Apply

```bash
./scripts/apply-frontend-dashboard-ui.sh /path/to/Teacher-s-App-frontent
```

Then build and deploy the frontend as usual.
