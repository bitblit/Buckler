var fs = require('fs');
var AWS = require('aws-sdk');
var cookieParser = require('cookie');

'use strict';

/**
 * This AWS Lambda function checks the supplied Basic Authentication header and validates it against
 * the pairs supplied in an environmental variable.  If it doesn't pass (or is missing) it sends a
 * 401 challenge.  If it does, it then proxies the underlying S3 object out to the client
 */
exports.handler = function (event, context, callback) {
    try {
        console.log("Initializing, event is :" + JSON.stringify(event));
        var bucketMapping = process.env.bucketMapping;
        var passwordListString = process.env.passwordList;
        var maxSizeInBytes = process.env.maxSizeInBytes;

        if (!event || !context || !bucketMapping || !passwordListString || !maxSizeInBytes) {
            console.log("Failed to initialize");
            callback(null, {'status': 'error', 'code': 400, 'message': 'A required field was missing'});
        }
        else {
            var cookie = (!event.headers) ? null : event.headers.Cookie;
            if (!validAuthentication(cookie, passwordListString)) {
                console.log("Failed authentication");
                fs.readFile(__dirname+ '/challenge.html','utf8',function(err,data){
                    var response = {
                        statusCode: 200,
                        headers: {'Content-Type':'text/html'},
                        body: data
                    }

                    if (!!err)
                    {
                        response.statusCode = 500;
                        response.body = "Error : "+err;
                    }

                    callback(null, response);
                });
            }
            else {
                var path = event.path;

                var responseCode = 200;
                var responseBody = {
                    message: "Path was " + path,
                    input: event
                };
                var response = {
                    statusCode: responseCode,
                    headers: {
                        "x-custom-header": "my custom header value"
                    },
                    body: JSON.stringify(responseBody)
                };
                console.log("response: " + JSON.stringify(response))
                callback(null, response);
            }
        }
    }
    catch (err)
    {
        var response = {
            statusCode: 500,
            headers: {'Content-Type':'text/html'},
            body: "Internal Server Error : "+err+" dir:"+__dirname
        }
        callback(null,response);
    }

};

function validAuthentication(authHeader, passwordListString)
{
    var parsedCookies = cookieParser.parse(authHeader);
    console.log("Header is "+authHeader+" parsed is "+JSON.stringify(parsedCookies));
    var auth = parsedCookies.BucklerAuthorization;
    var valid = false;

    if (!!auth)
    {
        console.log("Validating "+authHeader+" against "+passwordListString);
        var decoded = Buffer.from(auth,'base64');
        var passwords = passwordListString.split(',');
        for (var i=0;i<passwords.length && !valid;i++)
        {
            console.log("Testing "+decoded+" against "+passwords[i]);
            valid = passwords[i]==decoded;
        }

    }
    else
    {
        console.log("No auth found");
    }

    return valid;
}