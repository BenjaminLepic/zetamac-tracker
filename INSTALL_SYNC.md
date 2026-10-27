# Start syncing with either Google account

## Update an existing sync installation to 1.1.1

Version 1.1.1 fixes `Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation`. Replace the files inside your existing `zetamac-tracker-sync` folder with the files from the updated ZIP, keeping the folder path unchanged. In `chrome://extensions`, click the extension's reload button, then refresh its records page and retry **Connect Google Drive** or **Sync now**. Do not remove the installed extension; its local data and extension ID are unchanged.

## First installation

Google Cloud, the OAuth client and the app-data permission are configured. Both requested Google accounts are allowed to use this build. The project remains in Google's personal testing mode.

1. In the original extension, choose **Records & backups → Export backup**. Keep that JSON file.
2. Unzip `zetamac-recorder-google-sync.zip`. In Chrome's extension manager (`chrome://extensions`), enable Developer mode, choose **Load unpacked**, and select the **zetamac-tracker-sync** folder containing `manifest.json`.
3. Open the new extension's records page from its toolbar icon and **Import** your JSON backup. Verify your games are present, then disable the old recorder so it does not record duplicate games.
4. Choose **Connect Google Drive** and complete Google's permission screen. The extension asks for its own application-data folder only. Wait for a successful sync status.
5. In a Chrome profile signed into your other Google account, load the same build and connect that account. Each Google account has a separate Drive history. To put the same existing games in both accounts, import your JSON backup in each profile.
6. On another computer, use the same Google account and this same build; connect, then use **Sync now** to download its history.

Your original installation and its storage have not been removed. The sync build uses fixed extension ID `gnlfkgljonacgidhoagoldhhehjlnenb` across computers; Chrome cannot transfer the old extension's local storage automatically between IDs.

The Google configuration has been checked in the Console. Automated recording and sync tests pass. The final permission screen and first real upload must be completed in your browser; browser automation cannot control extension pages in this environment. Google's client configuration changes can take time to become active.
