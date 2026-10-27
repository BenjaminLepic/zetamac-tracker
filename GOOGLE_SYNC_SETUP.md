# Configure Google Drive sync

The extension is implemented and tested locally; Google account sync also needs an OAuth client issued by the owner of a Google Cloud project. The client ID is public configuration, not a client secret. Never put Google access tokens or private signing keys in this repository.

## Google Cloud project owner

1. In Google Cloud Console, create a dedicated project named **Zetamac Training Log**. Enabling billing is not required for this Drive-only integration.
2. Enable **Google Drive API** in that project.
3. Open **Google Auth Platform** and configure the application's branding and support contact.
4. Choose the appropriate audience. For a personal Gmail account this is **External**. During testing, add the Google accounts that should be allowed to connect as test users.
5. Add the non-sensitive scope `https://www.googleapis.com/auth/drive.appdata` in **Data Access**. Do not request broad Drive access.
6. In **Clients**, create an OAuth client with application type **Chrome Extension**. Enter this extension/item ID:

   `gnlfkgljonacgidhoagoldhhehjlnenb`

7. Copy its public client ID and configure the source:

   ```sh
   node scripts/configure-google.cjs YOUR_CLIENT_ID.apps.googleusercontent.com
   ```

8. Reload the sync extension, then choose **Records & backups → Connect Google Drive**. The user must complete Google's permission screen in their own browser.
9. Connect the same Google account in a second installation of this exact build; choose **Sync now** to verify records are restored.

The manifest's public `key` fixes the extension ID across computers. Keep it unchanged. The OAuth client ID and extension ID must match. No client secret or hosted backend is used.

For distribution beyond test accounts, complete Google's audience/publication requirements and provide the requested support and privacy details. A public GitHub repository does not itself publish either the extension or its Google authorization application.

## How syncing works

The extension calls Drive's `about.get` with the app-data scope to verify the actual connected account. Each immutable JSON revision is uploaded inside `appDataFolder`. Files are labelled with an application property; normal Drive files are not listed or read. Game recordings, annotations and deletion state have independent version stamps. This avoids silently overwriting keystrokes when another computer edits conditions.

Local writes finish without waiting for network requests. Sync retries after browser alarms; it refreshes expired tokens and stops if the actual Google account changes. Disconnect stops subsequent requests and leaves both copies intact. A request already in flight may finish. Invalid remote data is rejected without replacing local game data.

Recordings are only uploaded after the user explicitly connects. Existing local records are included. Keep JSON backups: Drive files, Google access, and extension storage can be removed independently.

Official references:

- [Chrome extension OAuth setup](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth)
- [Drive app-data folders and restricted app scope](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Drive about.get account information and scopes](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)
