var fs = require('fs');
var AWS = require('aws-sdk');
var cookieParser = require('cookie');
var AdmZip = require('adm-zip');

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
        var siteName = (process.env.siteName) ? process.env.siteName : 'Buckler';
        var directoryListingEnabled = true; //TODO: param?
        var defaultFile = 'index.html'; //TODO: param?

        var pathParts = createPathDescriptor(event, bucketMapping);

        if (!event || !context || !bucketMapping || !passwordListString || !maxSizeInBytes) {
            console.log("Failed to initialize");
            finish(callback, {'status': 'error', 'code': 400, 'message': 'A required field was missing'});
        }
        else {
            console.log("PathParts: " + JSON.stringify(pathParts) + " Bucket mapping: " + JSON.stringify(bucketMapping));

            // First, if a password was manually passed, set the cookie and redirect
            var handled = redirectOnQueryStringPassword(event, callback);
            if (!handled) {
                handled = processLogout(event, callback);
            }
            if (!handled) {
                handled = redirectOnFailedAuthentication(event, callback, passwordListString);
            }
            if (!handled) {
                handled = generateListJson(event, callback, directoryListingEnabled, pathParts);
            }
            if (!handled) {
                // If we reached here, we are proxying an S3 file!
                var s3 = new AWS.S3();
                var params = {Bucket: pathParts.bucketName, Key: pathParts.s3Key};
                console.log("We are attempting a s3-proxy, params are : "+JSON.stringify(params));

                s3.headObject(params).promise().then(function (meta) {
                        console.log("Max is " + maxSizeInBytes + " meta " + JSON.stringify(meta));
                        var size = parseInt(meta.ContentLength);
                        if (size > maxSizeInBytes) {
                            console.log("Size is " + size + ", larger than " + maxSizeInBytes + " redirecting");
                            const signedUrlExpireSeconds = 60 * 5; // 5 minute timeout
                            const presigned = s3.getSignedUrl('getObject', {
                                Bucket: pathParts.bucketName,
                                Key: pathParts.s3Key,
                                Expires: signedUrlExpireSeconds
                            });

                            finish(callback, {
                                statusCode: 302,
                                headers: {
                                    "Location": presigned
                                },
                                body: null
                            });
                        }
                        else {
                            /*
                            TODO: Unzip in a stream to a temporary S3 location, then send a 302 redirect to a presigned url
                            for that location
                            if (meta.ContentType == 'application/zip' && !!event.queryStringParameters && !!event.queryStringParameters.unzipTo) {
                                console.log("Unzipping first file of content to new content type:" + event.queryStringParameters.unzipTo);

                                s3.getObject(params).promise().then(function (data) {
                                    var zip = new AdmZip(data.Body);
                                    var zipEntries = zip.getEntries();
                                    console.log("Found " + zipEntries.length + " entries");

                                    var base64Encoded = isBinaryContentType(event.queryStringParameters.unzipTo);
                                    var contents = zip.readAsText(zipEntries[0]);
                                    var body = (base64Encoded) ? new Buffer(contents).toString('base64') : contents;

                                    response = {
                                        statusCode: 200,
                                        isBase64Encoded: base64Encoded,
                                        headers: {
                                            "Content-Type": event.queryStringParameters.unzipTo,
                                        },
                                        body: body
                                    };
                                });
                            }
                            else {*/
                                console.log("Calling s3, params = " + JSON.stringify(params));
                                s3.getObject(params).promise().then(function (data) {
                                    processS3Response(event, callback, data);
                                });
                            //}
                        }
                    }
                )
                    .catch(function (err) {
                        console.log("Error while contacting s3 : "+JSON.stringify(err));
                        var errMessage = err +" stack " + err.stack;
                        if (err.statusCode==404)
                        {
                            if (pathParts.s3Key.endsWith("/"))
                            {
                                finish(callback,  {
                                    statusCode: 302,
                                    headers: {
                                        "Location": pathParts.rootPath+defaultFile
                                    },
                                    body: null
                                });
                            }


                            errMessage = "You requested a file that does not exist (404)";
                        }

                        finish(callback,  {
                            statusCode: 404,
                            headers: {
                                "Content-Type": "text/html"
                            },
                            body: errMessage

                        })
                    });
            }

        }
    }
    catch (err) {
        var response = {
            statusCode: 500,
            headers: {'Content-Type': 'text/html'},
            body: "Internal Server Error : " + err + " stack " + err.stack
        }
        finish(callback,  response);
    }

};

function createPathDescriptor(event, bucketMapping) {
    var stage = event.requestContext.stage;
    var pathWithoutStage = (event.path.startsWith('/' + stage)) ? event.path.substring(stage.length + 1) : event.path;
    var rootPath = '/' + stage + pathWithoutStage;
    var splitIdx = pathWithoutStage.indexOf('/', 1);
    var bucketId = pathWithoutStage.substring(1, splitIdx);
    var s3Key = pathWithoutStage.substring(splitIdx + 1);
    var bucketName = (bucketId == null) ? null : bucketMapping[bucketId];
    var s3ParentKey = s3Key.substring(0, s3Key.lastIndexOf('/') + 1);

    // Default to the root bucket
    if (!bucketName && !!bucketMapping.root)
    {
        // Use the root bucket and fix the path
        bucketName = bucketMapping.root;
        s3ParentKey = bucketId+"/";
        s3Key = s3ParentKey+s3Key;
        bucketId = 'root';
    }

    // If we are in the root, it can lead to leading / on the s3Key
    while (s3Key.startsWith('/'))
    {
        s3Key = s3Key.substring(1); // Yeah, I know its inefficient - I will fix it later
    }

    return {
        stage: stage,
        pathWithoutStage: pathWithoutStage,
        rootPath: rootPath,
        bucketId: bucketId,
        s3Key: s3Key,
        bucketName: bucketName,
        s3ParentKey: s3ParentKey
    }
}

function processS3Response(event, callback, data) {
    var base64Encoded = isBinaryContentType(data.ContentType);
    var body = (base64Encoded) ? data.Body.toString('base64') : data.Body.toString();

    finish(callback, {
        statusCode: 200,
        isBase64Encoded: base64Encoded,
        headers: {
            "Content-Type": data.ContentType
        },
        body: body
    });
}

function isBinaryContentType(contentType) {
    return contentType.startsWith("image") || contentType == "application/zip";
}

function generateListJson(event, callback, directoryListingEnabled, pathParts) {
    var handled = false;
    if (directoryListingEnabled && event.path.endsWith("/list.json")) {
        handled = true;
        console.log("Attempting to generate list.json for directory " + pathParts.s3ParentKey);

        var s3 = new AWS.S3();

        var params = {
            Bucket: pathParts.bucketName,
            Delimiter: '/',
            Prefix: pathParts.s3ParentKey
        }

        s3.listObjects(params, function (err, data) {
            if (err) {
                finish(callback,  {
                    statusCode: 404,
                    headers: {
                        "Content-Type": "text/html"
                    },
                    body: "Missing : " + err + " stack " + err.stack
                })
            }
            else {
                delete (data.Marker);
                delete (data.Name);
                delete (data.Prefix);
                delete (data.Delimiter);
                delete (data.MaxKeys);

                var files = [];
                var folders = [];
                data.Contents.forEach(function (val) {
                    files.push(
                        {
                            name: val.Key.substring(pathParts.s3ParentKey.length),
                            lastModified: val.LastModified,
                            size: val.Size
                        }
                    );
                });
                data.CommonPrefixes.forEach(function (val) {
                    folders.push(
                        val.Prefix.substring(pathParts.s3ParentKey.length)
                    )
                });
                delete (data.Contents);
                delete (data.CommonPrefixes);
                data['files'] = files;
                data['folders'] = folders;


                finish(callback,  {
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

function processLogout(event, callback) {
    var handled = false;

    if (!!event.queryStringParameters && !!event.queryStringParameters.logout) {
        handled = true;
        dumpLocalFile(callback, "/logout.html");
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

function dumpLocalFile(callback, filename, replacements) {
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

        finish(callback,  response);
    });
}


function redirectOnQueryStringPassword(event, callback) {
    var handled = false;
    if (!!event.queryStringParameters && !!event.queryStringParameters.p) {
        console.log("Processing query string password");
        var newCookieValue = "BucklerAuthorization=" + new Buffer(event.queryStringParameters.p).toString('base64');

        finish(callback,  {
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

function calculateCurrentPath(event) {
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

    console.log("valid authentication returning " + valid);
    return valid;
}

function createBucketMapping(input) {
    var rval = {};
    var split = input.split(",");
    for (var i = 0; i < split.length; i++) {
        var parts = split[i].split("=");
        rval[parts[0]] = parts[1];
    }

    if (!rval.root)
    {
        console.log("Warning!  No root bucket defined");
    }

    return rval;
}

function finish(callback, response)
{
    if (!callback || !response)
    {
        throw Exception("Missing callback or response");
    }
    if (!response.statusCode)
    {
        console.log("WARNING: no status code");
        response.statusCode=200;
    }
    if (!response.headers)
    {
        response.headers={};
    }

    response.headers['Access-Control-Allow-Origin']='*';

    callback(null,response);
}
