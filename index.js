'use strict';
var fs = require('fs');
var Crawler = require("crawler");
var htmlparser2 = require("htmlparser2");
var AWS = require('aws-sdk');

var c = new Crawler();
var pageContents = "";
var forceCrawl = "false";

var crawlSites = 
{
    sites: [{
        name: "service-terms",
        url: "https://aws.amazon.com/service-terms/",
        folder : "/",
        contentTag: "main"
    },
    {
        name: "aws-agreement",
        url: "https://aws.amazon.com/agreement/",
        folder : "/",
        contentTag: "main"
    }]
};

//defines the behavior of the parser
var parser = new htmlparser2.Parser(
    {
        //we are only interested in pulling the text and not tage
        ontext(text) {
            if(/^\s*$/.test(text)) {}
            else
            {
                pageContents = pageContents + text;
            }
        }
    },
    { 
        decodeEntities: true,
        xmlMode: true,
        recognizeSelfClosing: true
    }
);



exports.handler = function(event, context, callback){
    
    

    //you can use querystring ?force=true to force a site crawl
    if(event && event.queryStringParameters && event.queryStringParameters.force)
    {
        forceCrawl = event.queryStringParameters.force;
    }
    
    for(var i=0 ; i < crawlSites.sites.length; i++)
    {
        console.log("Currently Processing: " + JSON.stringify(crawlSites.sites[i]));
        
        //Runs crawler Function for retrieving site contents
        c.direct({
            uri: crawlSites.sites[i].url,
            timeout: 1500000,
            skipEventRequest: false, 
            callback: function(error, response) {
                
                //checks if site returned correctly
                if(error) {
                    console.log(error)
                    callback(null, {
                          "statusCode": 200,
                          "isBase64Encoded": false,
                          "body": JSON.stringify({
                            "status": "Success",
                            "message": error
                        })
                    });
                } else {
                    console.log("Last modified Date Response: " + response.headers["last-modified"]);
                    
                    //pulls site last modified date from the crawl payload
                    var curdate = new Date(response.headers["last-modified"]);
                    
                    console.log("Last Modified Date: " + curdate);
                    console.log("Todays Date: " + new Date().toDateString());
                    console.log("forceCrawl: " + forceCrawl);
                    
                    //evaluate if the site has changed or you are forcing a crawl
                    if(new Date().toDateString() === curdate.toDateString() || forceCrawl === "true")
                    {
                        pageContents = "";
                        console.log("Document Has Changed");
                        //only parse the content in the <main> tag. This on AWS sites denoted the content
                        parser.write(response.$(crawlSites.sites[this.i].contentTag).text());
                        parser.end();
                        //dump parsed results to S3
                        
                        var filename = crawlSites.sites[this.i].name + ".new";
                        console.log("Saving Contents to: " + filename);
                        
                        putObjectToS3("page-scrape-data", filename, pageContents, callback);
                    }
                    else
                    {
                        //If nothing is modified in the service nothing happens...
                        console.log("No Changes To Page. Last Modified: " + curdate.toDateString());
                        //api gateway supported return payload
                        callback(null, {
                            "statusCode": 200,
                            "isBase64Encoded": false,
                            "body": JSON.stringify({
                                "status": "Success",
                                "message": "No Changes to Site"
                            })
                        });
                    }
                }
                
            }.bind( {i: i} )
        });
    }
};

function putObjectToS3(bucket, key, data, callback){
    var s3 = new AWS.S3();
    var createparams = {
        Bucket : bucket,
        Key : key,
        Body : data
    }
    
    var deleteparams = { 
        Bucket: bucket, 
        Delete: 
        { 
            Objects: [ 
                {
                    Key: key
                    
                } 
            ]
            
        }
    }
    
    s3.deleteObjects(deleteparams, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        s3.putObject(createparams, function(err2, data2) {
          if (err2) console.log(err2, err2.stack); // an error occurred
          callback(null, {
              "statusCode": 200,
              "isBase64Encoded": false,
              "body": JSON.stringify({
                "status": "Success",
                "message": "Function Completed Successfully"
              })
            });
        });
    });
}
