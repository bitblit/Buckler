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
        var bucketMapping = createBucketMapping(process.env.bucketMapping);
        var passwordListString = process.env.passwordList;
        var maxSizeInBytes = process.env.maxSizeInBytes;

        if (!event || !context || !bucketMapping || !passwordListString || !maxSizeInBytes) {
            console.log("Failed to initialize");
            callback(null, {'status': 'error', 'code': 400, 'message': 'A required field was missing'});
        }
        else {
            console.log("Bucket mapping: "+JSON.stringify(bucketMapping));

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

                var splitIdx = path.indexOf('/',1);
                var bucketKey = path.substring(1,splitIdx);
                var subpath = path.substring(splitIdx+1);
                var bucket = (bucketKey==null)?null:bucketMapping[bucketKey];
                var msg = ('path='+path+' split '+splitIdx+' bkey='+bucketKey+'bucket='+bucket+' subpath='+subpath);

                console.log(msg);

                var s3 = new AWS.S3();
                var params = {Bucket: bucket, Key: subpath}

                console.log("Calling s3, params = "+JSON.stringify(params));
                s3.getObject(params, function(err, data) {
                    if (err)
                    {
                        console.log("S3 err = "+JSON.stringify(err));
                        callback(null,{
                            statusCode: 404,
                            headers: {
                                "Content-Type": "text/html"
                            },
                            body: "Missing : "+err+" m:"+msg

                        })
                    }
                    else
                    {
                        console.log("S3 data = "+JSON.stringify(data));
                        callback(null,{
                            statusCode: 200,
                            headers: {
                                "Content-Type": data.ContentType,
                                "Content-Length": data.ContentLength,
                            },
                            body: data.Body.toString()

                        })
                    }
                });
            }
        }
    }
    catch (err)
    {
        var response = {
            statusCode: 500,
            headers: {'Content-Type':'text/html'},
            body: "Internal Server Error : "+err
        }
        callback(null,response);
    }

};

function validAuthentication(authHeader, passwordListString)
{
    var valid = false;
    if (!!authHeader && !!passwordListString)
    {
        var parsedCookies = cookieParser.parse(authHeader);
        console.log("Header is "+authHeader+" parsed is "+JSON.stringify(parsedCookies));
        var auth = parsedCookies.BucklerAuthorization;

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
    }

    return valid;
}

function createBucketMapping(input)
{
    var rval = {};
    var split = input.split(",");
    for (var i=0;i<split.length;i++)
    {
        var parts = split[i].split("=");
        rval[parts[0]]=parts[1];
    }
    return rval;
}