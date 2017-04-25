var AWS = require('aws-sdk');

'use strict';

/**
 * This AWS Lambda function checks the supplied Basic Authentication header and validates it against
 * the pairs supplied in an environmental variable.  If it doesn't pass (or is missing) it sends a
 * 401 challenge.  If it does, it then proxies the underlying S3 object out to the client
 */
exports.handler = function (event, context, callback) {
    console.log("Initializing");
    var bucketMapping = process.env.bucketMapping;
    var userList = process.env.userList;
    var maxSizeInBytes = process.env.maxSizeInBytes;

    if (!event || !context || !bucketMapping || !userList || !maxSize)
    {
        console.log("Failed to initialize");
        callback(null,{'status':'error','code':400,'message':'A required field was missing'});
    }
    else
    {
        var authHeader = event.params.header.Authentication;
        if (!validAuthentication(authHeader, userList))
        {
            console.log("Failed authentication");
            callback(null,{'status':'error','code':403,'message':'The credentials supplied are invalid'});
        }
        else
        {
            var path = event.params.path;
            callback(null,{'status':'ok','code':200,'message':'Need to proxy here'});
        }
    }

};

function validAuthentication(authHeader, userList)
{
    console.log("Validating "+authHeader+" against "+userList);
    return false;
}