# GeoAttend (Google Sheets edition)

Attendance with geofencing (check in only inside a zone) and geotagging
(coordinates, accuracy, zone, distance saved on every check-in/out).
Your Google Sheet is the database; a small Apps Script is the backend.

## 1. Set up the Sheet (about 5 minutes)

1. Create a new Google Sheet.
2. **Extensions > Apps Script**. Delete the sample code and paste in `apps-script/Code.gs`.
3. Choose the `setup` function in the toolbar and click **Run**. Approve the permissions
   (click **Advanced > Go to project** if Google warns the app is unverified).
   This creates the `Zones`, `Attendance` and `Settings` tabs.
4. **Deploy > New deployment > Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
5. In the `Settings` tab, change `adminPin` from `1234` to your own PIN.

If you edit the script later, use **Deploy > Manage deployments > Edit > New version** so the link keeps working.

## 2. Run the app

```bash
npm install
npm run dev
```

Paste the Web app URL on the welcome screen, or put it in `.env` as `VITE_SHEETS_URL`
(and in Vercel's environment variables when you deploy) so staff never see it.

## 3. Set the geofence

Open the **Zones** tab: tap the map or use your current location, set the radius, enter the
admin PIN and save. You can also edit the `Zones` tab in the Sheet directly
(columns: name, lat, lng, radius in metres; leave `id` empty on new rows).

## Notes

- Check-ins are validated on the server (the Apps Script), so a tampered browser can't skip the geofence.
- Change the accuracy limit and late time in the `Settings` tab. The late time shown in History is `LATE_AFTER` in `src/App.jsx`.
- Anyone with the web app link can read zones and history by name, and browser GPS can be spoofed.
  Fine for a small team; add real logins before wider use.
