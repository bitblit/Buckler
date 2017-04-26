# Buckler
A NodeJS-AWS-APIGateway-Lambda approach for serving S3 bucket(s) with authentication


## Why not BASIC/DIGEST Authentication?

Simple - because AWS currently won't let me create a WWW-Authenticate header (as of 04/26/2017) - they remap it
to a header the browser won't respect.  Also, quite frankly BASIC auth has certain downsides, like the inability
to do a logout.  Using a formatted cookie gives me most of the advantages of BASIC auth without these disadvantages.

Plus, I can create a nicer login page.

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
* Grunt (npm install grunt -g) (npm install grunt-cli -g)

1) Create a new Lambda function, NodeJS 6.10 (grab the arn) 
1a) May need to create a role - this role should have ListObject and GetObject on the bucket(s) to be proxied
1b) Up the timeout to 30 seconds
1c) Set memory based on max file size
2) Stick the ARN in gruntfile
3) Run "npm install"
4) 

## Binary Support
If your images/other binary data aren't showing up correctly, you may need to enable binary support in API gateway.
The smartest way to do this is just add */* as a binary type (as of 04/2017) since it doesn't hurt the text
 types as long as the isBase64Encoded flag is set correctly, which it is in Buckler.

## Features

## list.json
By default, Buckler will respond to any request to list.json with a json-formatted list of the files in that
directory.  

## Large Objects
Lambda doesn't currently support body streaming - this means that any file served through this will be loaded into
memory and then spit out to API Gateway.  The way I deal with this is that you can configure a size over which instead
of the file being served, a 301 to a pre-signed url is served instead.  Set this carefully.

## TODO

* Hash the password (server provides salt)
* Redirect on large bodies
* Deployment script for people who aren't me
* .unzip handler

## Done
X Verify binaries work (pictures)
X list.json endpoint
X Login via parameter
X Logout endpoint
X Cleanup the login page
X Cookie timeout?





