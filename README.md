# Buckler
A NodeJS-AWS-APIGateway-Lambda approach for serving S3 bucket(s) with basic authentication


## Introduction

### Getting started
You'll need the following things installed:
* NodeJS 6.10 : Go to https://nodejs.org/en/download/ and run the installer
* NPM (this came with NodeJS)
* Serverless: (From https://serverless.com/) : npm install serverless -g




### Caveats

Lambda doesn't currently support body streaming - this means that any file served through this will be loaded into
memory and then spit out to API Gateway.  The way I deal with this is that you can configure a size over which instead
of the file being served, a 301 to a pre-signed url is served instead.  Set this carefully.
