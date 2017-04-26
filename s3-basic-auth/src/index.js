var fs = require('fs');
var AWS = require('aws-sdk');
var cookieParser = require('cookie');

'use strict';

/**
 * Enforces simple (but not BASIC) authentication against the proxied S3 bucket(s) plus
 * some other helper functionality.
 *
 */
exports.handler = function (event, context, callback) {
    try {
        console.log("Initializing, event is :" + JSON.stringify(event));
        // Environmental variables
        var bucketMapping = createBucketMapping(process.env.bucketMapping);
        var passwordListString = process.env.passwordList;
        var maxSizeInBytes = process.env.maxSizeInBytes;
        var directoryListingEnabled = true; //TODO: param?

        // Stuff I calculate from the path
        var path = event.path;
        var splitIdx = path.indexOf('/', 1);
        var bucketKey = path.substring(1, splitIdx);
        var subpath = path.substring(splitIdx + 1);
        var bucket = (bucketKey == null) ? null : bucketMapping[bucketKey];


        if (!event || !context || !bucketMapping || !passwordListString || !maxSizeInBytes) {
            console.log("Failed to initialize");
            callback(null, {'status': 'error', 'code': 400, 'message': 'A required field was missing'});
        }
        else {
            console.log("Bucket mapping: " + JSON.stringify(bucketMapping));

            // First, if a password was manually passed, set the cookie and redirect
            var handled = redirectOnQueryStringPassword(event, callback);
            if (!handled) {
                handled = processLogout(event,callback);
            }
            if (!handled) {
                handled = redirectOnFailedAuthentication(event, callback, passwordListString);
            }
            if (!handled) {
                handled = generateListJson(event,callback,directoryListingEnabled, bucket, subpath);
            }
            if (!handled) {
                // If we reached here, we are proxying an S3 file!
                var msg = ('path=' + path + ' split ' + splitIdx + ' bkey=' + bucketKey + 'bucket=' + bucket + ' subpath=' + subpath);

                console.log(msg);

                var s3 = new AWS.S3();
                var params = {Bucket: bucket, Key: subpath}

                console.log("Calling s3, params = " + JSON.stringify(params));
                s3.getObject(params, function (err, data) {
                    if (err) {
                        console.log("S3 err = " + JSON.stringify(err));
                        callback(null, {
                            statusCode: 404,
                            headers: {
                                "Content-Type": "text/html"
                            },
                            body: "Missing : " + err + " m:" + msg

                        })
                    }
                    else {
                        console.log("S3 data = " + JSON.stringify(data));

                        var base64Encoded = isBinaryContentType(data.ContentType);
                        var body = (base64Encoded) ? data.Body.toString('base64') : data.Body.toString();

                        var response = {
                            statusCode: 200,
                            isBase64Encoded: base64Encoded,
                            headers: {
                                "Content-Type": data.ContentType,
                            },
                            body: body//new Buffer(data.Body, 'base64')//Array.prototype.slice.call(data.Body,0)//.toString()
                        };

                        console.log("Response:" + JSON.stringify(response));

                        callback(null, response);
                    }
                });
            }

        }
    }
    catch (err) {
        var response = {
            statusCode: 500,
            headers: {'Content-Type': 'text/html'},
            body: "Internal Server Error : " + err
        }
        callback(null, response);
    }

};

function isBinaryContentType(contentType)
{
    return contentType.startsWith("image") || contentType=="application/zip";
}

function generateListJson(event, callback,directoryListingEnabled, bucket, subpath)
{
    var handled = false;
    if (directoryListingEnabled && event.path.endsWith("/list.json"))
    {
        handled = true;
        var dirToList = subpath.substring(0,subpath.length-9);
        console.log("Attempting to generate list.json for directory "+dirToList);

        var s3 = new AWS.S3();

        var params = {
            Bucket: bucket,
            Delimiter: '/',
            Prefix: dirToList
        }

        s3.listObjects(params, function (err, data) {
            if (err)
            {
                callback(null, {
                    statusCode: 404,
                    headers: {
                        "Content-Type": "text/html"
                    },
                    body: "Missing : " + err + " m:" + msg

                })
            }
            else
            {
                delete (data.Marker);
                delete (data.Name);
                delete (data.Prefix);
                delete (data.Delimiter);
                delete (data.MaxKeys);

                var files = [];
                var folders = [];
                data.Contents.forEach(function(val){
                    files.push(
                        {
                            name : val.Key.substring(dirToList.length),
                            lastModified: val.LastModified,
                            size: val.Size
                        }
                    );
                });
                data.CommonPrefixes.forEach(function(val){
                    folders.push(
                       val.Prefix.substring(dirToList.length)
                   )
                });
                delete (data.Contents);
                delete (data.CommonPrefixes);
                data['files']=files;
                data['folders']=folders;


                callback(null, {
                    statusCode: 200,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(data)

                })

            }
        });
    }
    return handled;
}

function processLogout(event, callback)
{
    var handled = false;

    if (!!event.queryStringParameters && !!event.queryStringParameters.logout) {
        handled=true;
        dumpLocalFile(callback,"/logout.html");
    }

    return handled;
}

function redirectOnFailedAuthentication(event, callback, passwordListString) {
    var handled = false;
    var cookie = (!event.headers) ? null : event.headers.Cookie;
    if (!validAuthentication(cookie, passwordListString)) {
        console.log("Failed authentication");
        handled = true;
        dumpLocalFile(callback, '/challenge.html');
    }
    return handled;
}

function dumpLocalFile(callback, filename)
{
    fs.readFile(__dirname + filename, 'utf8', function (err, data) {
        var response = {
            statusCode: 200,
            headers: {'Content-Type': 'text/html'},
            body: data
        }

        if (!!err) {
            response.statusCode = 500;
            response.body = "Error : " + err;
        }

        callback(null, response);
    });
}


function redirectOnQueryStringPassword(event, callback) {
    var handled = false;
    if (!!event.queryStringParameters && !!event.queryStringParameters.p) {
        console.log("Processing query string password");
        var newCookieValue = "BucklerAuthorization=" + new Buffer(event.queryStringParameters.p).toString('base64');

        callback(null, {
            statusCode: 301,
            headers: {
                'Set-Cookie': newCookieValue,
                'Location': calculateCurrentPath(event)
            },
            body: ''
        })
        handled = true;
    }
    return handled;
}

function calculateCurrentPath(event)
{
    var stage = event.requestContext.stage;
    var currentPath = '/' + stage + event.path;
    return currentPath;
}


function validAuthentication(authHeader, passwordListString) {
    var valid = false;
    if (!!authHeader && !!passwordListString) {
        var parsedCookies = cookieParser.parse(authHeader);
        console.log("Header is " + authHeader + " parsed is " + JSON.stringify(parsedCookies));
        var auth = parsedCookies.BucklerAuthorization;

        if (!!auth) {
            console.log("Validating " + authHeader + " against " + passwordListString);
            var decoded = Buffer.from(auth, 'base64');
            var passwords = passwordListString.split(',');
            for (var i = 0; i < passwords.length && !valid; i++) {
                console.log("Testing " + decoded + " against " + passwords[i]);
                valid = passwords[i] == decoded;
            }

        }
        else {
            console.log("No auth found");
        }
    }

    return valid;
}

function createBucketMapping(input) {
    var rval = {};
    var split = input.split(",");
    for (var i = 0; i < split.length; i++) {
        var parts = split[i].split("=");
        rval[parts[0]] = parts[1];
    }
    return rval;
}