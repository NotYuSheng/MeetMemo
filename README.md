# Full-stack Meet-Memo
This is the development branch for MeetMemo's full stack application. Here are its features thus far:
- Audio uploads - the app supports audio uploads to the backend, which is then transcribed & output to the user.
- Historical transcriptions - the app displays all stored user transcriptions in the past, & the user can expand these tabs to display the transcribed text.

## App testing
To test the application, you have to start up both the web app & the FastAPI server. Run the following commands:

To run the FastAPI app: `uvicorn app:app --reload --host 0.0.0.0 --port 8000`

To run the React development interface:
- `npm install`
- `npm run build`
- `npm start`