//gets current port from environment
var port = process.env.PORT || 9000;

//import dependancies
var http = require('http');
var websocket = require("websocket.io");
var express = require("express");
var request = require('request');
var GoogleSpreadsheet = require("google-spreadsheet");
var async = require('async');

//set static http server listening at port and bind websocket to http 
var app = express();
app.use(express.static(__dirname + "/"));
var webServerApp = http.createServer(app).listen(port);  
var webSocketServer = websocket.attach(webServerApp);

console.log("http server listening on %d", port)

//Web Socket part
webSocketServer.on("connection", function (socket) {

    console.log("Connection established."); 

    socket.send("Ready to port from tracker");

    //do when receiving a message
    socket.on("message", function (message) {
        socket.send("Preparing to port stories") 

        //parse JSON string 
        obj = JSON.parse(message);
        var clearNum = parseInt(obj['clrLn']);
        var worksheetNum = parseInt(obj['shtNm']);

        //extract spreadsheet key from url 
        var spreadsheetKey = getIdFromUrl(obj['shURL']);

        //removes non numerical characters from the url to obtain project ID
        var projectNum = obj['trURL'].replace(/\D/g, ''); 

        var trackerAuth = obj['tauth'];
        var clientEmail = obj['email'];
        var privateKey = obj['prkey'];
        console.log("trackerAuth: " + trackerAuth);
        console.log("clientEmail: " + clientEmail);
        console.log("privateKey: " + privateKey);

        console.log("Spreadsheet key:" + spreadsheetKey);
        console.log("Spreadsheet num:" + projectNum);

        //begin constructing https request to pivotal tracker
        var https = require('https');
        var sheet;
        var options = {
            uri: 'https://www.pivotaltracker.com/services/v5/projects/' + projectNum + '/stories?date_format=millis&with_state=finished',
            method: 'GET',
            json: true,
            headers: { "X-TrackerToken": trackerAuth }
        };

        console.log(options);
        
        //make pivotal tracker api request
        request(options, function(error, response, body){
            if(error) {
                console.log(error);
            } else {
                //open the google spreadsheet by key
                var doc = new GoogleSpreadsheet(spreadsheetKey);

                //async series takes arguments array of functions to execute with arguments callback, and callback function to execute when all tasks complete
                async.series([
                    //oauth 
                    function setAuth(step) {
                        var creds_json = {
                            client_email: clientEmail,
                            private_key: privateKey
                        }

                        console.log("Creds: " + creds_json)
                 
                        doc.useServiceAccountAuth(creds_json, step);
                    },
                    //gets spreadsheet info
                    function getInfoAndWorksheets(step) {
                        doc.getInfo(function(err, info) {
                            console.log('Loaded doc: '+info.title+' by '+info.author.email);

                            //creates worksheet item
                            sheet = info.worksheets[worksheetNum-1];

                            //error checking for worksheet out of range
                            if (sheet === undefined){
                                console.log(worksheetNum + " is not a valid sheet");
                                socket.send(worksheetNum + " is not a valid worksheet number");
                                return;
                            }

                            socket.send('Porting to: ' + info.title + ' - ' + sheet.title);

                            //callback
                            step();
                        });
                    },
                    function deletingCells(step) {
                        console.log("deleting cells")
                        sheet.getCells({
                            'min-row': 2,
                            'max-col': 6,
                            'return-empty': true
                        }, function(err, cells) {
                            //"deletes" all cells up to line clearNum in the first 6 columns
                            for (var i = 0; i < (clearNum-1)*6; i++){
                                cells[i].value = "";
                            }

                            //update cells and call callback function
                            sheet.bulkUpdateCells(cells, step); 
                        });
                    },
                    function portStories(step) {
                        console.log("porting stories")
                        socket.send("Porting stories")
                        sheet.getCells({
                            'min-row': 2,
                            'max-col': 1,
                            'return-empty': true
                        }, function(err, cells) {
                            for (var i = 0; i < body.length; i++){
                                cells[i].value = body[i].name;
                            }
                            sheet.bulkUpdateCells(cells, step); 
                        });
                    },
                    function portStoryIDs(step) {
                        console.log("porting urls")
                        sheet.getCells({
                            'min-row': 2,
                            'min-col': 5,
                            'max-col': 5,
                            'return-empty': true
                        }, function(err, cells) {
                            for (var i = 0; i < body.length; i++){
                                cells[i].value = body[i].url;
                            }
                            sheet.bulkUpdateCells(cells, step); 
                        });
                    }
                ], function(err){
                    console.log("transfer completed");
                    socket.send("Transfer completed");
                });
            }
        });
    });

    socket.on("error", function(error){
        console.log("Error: " + error);
    });

    socket.on("close", function () { console.log("Connection closed."); });
});

//parses the URL for the google spreadsheet key
function getIdFromUrl(url) {
    return url.match(/[-\w]{25,}/);
}

















