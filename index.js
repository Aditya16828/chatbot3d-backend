import express from 'express';
import bodyParser from 'body-parser';
import dialogflow from '@google-cloud/dialogflow';
import cors from 'cors';
import fs from 'fs';
import child_process from 'child_process';
import dotenv from 'dotenv';

const PORT = 3000;
const sessionClient = new dialogflow.SessionsClient();


async function detectIntent(projectId, sessionId, query, contexts, languageCode) {
    const sessionPath = sessionClient.projectAgentSessionPath(projectId, sessionId);

    const request = {
        session: sessionPath,
        queryInput: {
            text: {
                text: query,
                languageCode: languageCode,
            },
        },
    };

    if (contexts && contexts.length > 0) {
        request.queryParams = {
            contexts: contexts,
        };
    }

    const responses = await sessionClient.detectIntent(request);
    return responses[0];
}

let context;

async function executeQueries(projectId, sessionId, queries, languageCode) {
    let intentResponse;
    let isEnd = false, i = 0;
    while (!isEnd && queries.length > i) {
        let query = queries[i];
        try {
            console.log(`Sending Query: ${query}`);
            intentResponse = await detectIntent(projectId, sessionId, query, context, languageCode);

            // console.log(intentResponse);
            if (intentResponse.queryResult.diagnosticInfo) {
                console.log(intentResponse.queryResult.diagnosticInfo.fields.end_conversation);
                isEnd = intentResponse.queryResult.diagnosticInfo.fields.end_conversation.boolValue;
            }
            
            console.log(`Fulfillment Text: ${intentResponse.queryResult.fulfillmentText}`);
            console.log("*********************************");

            context = intentResponse.queryResult.outputContexts;
        } catch (error) {
            console.log(error);
        }
        ++i;
    }

    return {isBye: isEnd, audio: intentResponse.outputAudio, text: intentResponse.queryResult.fulfillmentText};
}

const setupNrunServer = async () => {
    const app = express();
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.options("*", cors({ origin: 'http://localhost:5173', optionsSuccessStatus: 200 }));

    app.use(cors({ origin: "http://localhost:5173", optionsSuccessStatus: 200 }));

    app.listen(PORT, async () => {
        console.log(`Listening on port ${PORT}`);

        const projectId = dotenv.config().parsed.PROJECTID;
        const sessionId = '*';
        const languageCode = 'en';

        app.post('/', async (req, res) => {
            console.log(req.body.text);
            const query = req.body.text;
            console.log(query);
            const response = await executeQueries(projectId, sessionId, [query], languageCode);

            // console.log(response);

            const audio = response.audio;
            console.log(audio.length);

            const base64 = Buffer.from(audio).toString('base64');
            const buffer = Buffer.from(base64, 'base64');

		    const filePath = '../my-app/public/audios/audio.wav';
		    fs.writeFileSync(filePath, buffer);

            const rhubarbFile = '../Rhubarb-Lip-Sync-1.13.0-Linux/rhubarb';
            const jsonFilePath = '../my-app/public/audios/audio.json';
            const filePathmodified = '../my-app/public/audios/audio.wav';
            const jsonFilePathmodified = '../my-app/public/audios/audio.json';

            child_process.execSync(`${rhubarbFile} -f json ${filePathmodified} -o ${jsonFilePath}`);

            const jsonFile = fs.readFileSync(jsonFilePathmodified);
            // response.audio = base64;
            console.log(JSON.parse(jsonFile));
            res.status(200).send({ audio: base64, jsonFile: JSON.parse(jsonFile)});
        })
    });
}

setupNrunServer();
