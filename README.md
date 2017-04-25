# Buckler
A NodeJS-AWS-APIGateway-Lambda approach for serving S3 bucket(s) with basic authentication


## Introduction

Imagine I have buckets my-bucket-1 and my-bucket-2
I have mapped A->my-bucket-1 and B->my-bucket-2
I have mapped my API gateway to test.com

The file x/y.txt in bucket A will be at url:

http://test.com/A/x/y.txt


### Getting started
You'll need the following things installed:
* NodeJS 6.10 : Go to https://nodejs.org/en/download/ and run the installer
* NPM (this came with NodeJS)

1) Create a new Lambda function, NodeJS 6.10 (grab the arn) 
1a) May need to create a role - this role should have ListObject and GetObject on the bucket(s) to be proxied
1b) Up the timeout to 30 seconds
1c) Set memory based on max file size
2) Stick the ARN in gruntfile





### Caveats

Lambda doesn't currently support body streaming - this means that any file served through this will be loaded into
memory and then spit out to API Gateway.  The way I deal with this is that you can configure a size over which instead
of the file being served, a 301 to a pre-signed url is served instead.  Set this carefully.


