const download = require('image-downloader');
const {Client } = require("pg");
const axios = require('axios');
const fs = require('fs');
const http = require('https');
const unirest = require("unirest");
const { Configuration, OpenAIApi } = require("openai");
const databaseUrl = fs.readFileSync('/home/twitbot/twitBotAI/.databaseurl', 'utf8');
const myPassword = fs.readFileSync('/home/twitbot/twitBotAI/.password', 'utf8');
const { getGender } = require('gender-detection-from-name');
//const myOpenAIApiKey = fs.readFileSync('/home/twitbot/twurlBot/.openAiApiKey', 'utf8');
const CryptoJS = require('crypto-js');
//const botData = require('/home/twitbot/twurlBot/botData.json');
//const tags = botData.tags;
const request = require('request');
const cheerio = require('cheerio');
const newsSites = ['https://globaleconomics.news', 'https://fox8.news', 'https://cryptnomics.org/'];
var botData, tags;
const delay = (t, val) => new Promise(resolve => setTimeout(resolve, t, val));

const decryptWithAES = (ciphertext, passphrase) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);
  return originalText;
};
async function start() {
    botData = await getRemoteBotData();
    tags = botData.tags;
}
start();

async function getTwitterBio(gender, bioTopics) {
    const myOpenAIApiKey = fs.readFileSync('/home/twitbot/twurlBot/.openAiApiKey', 'utf8');
    const sentiment = botData.sentiment[getRandomInt(botData.sentiment.length)];
    const adder = botData.adder[getRandomInt(botData.adder.length)];
    const configuration = new Configuration({
      apiKey: myOpenAIApiKey.trim(),
    });
    var maxTokens = 42;
    var promptText = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Create 130 character max twitter bio for a " + gender + " using these topics and hashtags similar to these topics: " + bioTopics},
    ];

    const openai = new OpenAIApi(configuration);
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: promptText,
      temperature: 1.0,
      max_tokens: maxTokens,
      top_p: 1.0,
      frequency_penalty: 2.0,
      presence_penalty: 2.0,
    });
    //console.log(response.data.choices);
    var bioText = response.data.choices[0].message.content;
    bioText = bioText.replace(/^"(.*)"$/, '$1');

    return new Promise((resolve, reject) => {
        resolve(bioText);
    });
}

async function getTweetText() {
    const myOpenAIApiKey = fs.readFileSync('/home/twitbot/twurlBot/.openAiApiKey', 'utf8');
    const sentiment = botData.sentiment[getRandomInt(botData.sentiment.length)];
    const adder = botData.adder[getRandomInt(botData.adder.length)];
    const requestStatement = botData.requestStatements[getRandomInt(botData.requestStatements.length)];
    const configuration = new Configuration({
      apiKey: myOpenAIApiKey.trim(),
    });

    var promptText;
    var maxTokens = 70;
    var tweetMediaLink;

    let tagArray = selectTags(5);
    let tagText = tagArray.join(' ');

    let tweetTypeFlag = getRandomInt(100)
    if(tweetTypeFlag < 65) {

        var randomFlag = getRandomInt(100);
        if(randomFlag > 90) {
            promptText = [
                {"role": "system", "content": "You are a " + adder + " person."},
                {"role": "user", "content": "Create a " + adder + " " + sentiment + " tweet about how your day is going and include hashtags similar to the following: " + tagText},
            ];
        } else if (randomFlag > 25 && randomFlag <= 90) {
             promptText = [
                {"role": "system", "content": "You are a " + adder + " person."},
                {"role": "user", "content": "Create a " + adder + " " + sentiment + " tweet about the following while using different words and some of the same hashtags: " + tagText},
            ];
        } else {
            promptText = [
                {"role": "system", "content": "You are a " + adder + " person."},
                {"role": "user", "content": requestStatement + " using a " + adder + " " + sentiment + " tone"},
            ];
        }

        const openai = new OpenAIApi(configuration);
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: promptText,
            temperature: 1.0,
            max_tokens: maxTokens,
      	    top_p: 1.0,
            frequency_penalty: 2.0,
            presence_penalty: 2.0,
        });
        let aiResponse = await response;
        let aiResponseText = aiResponse.data.choices[0].message.content;
        aiResponseText = aiResponseText.replace(/^"(.*)"$/, '$1');
        //console.log('AI Response: ' + aiResponseText);
        //await recordTweet(promptText[1].content, aiResponseText);

        tagArray = selectTags(getRandomIntBetween(1, 3));
        var sendText;
        var mediaFlag = getRandomInt(100);
        if(aiResponseText.length < 250 && mediaFlag <= 50) {
            tweetMediaLink = await generateTweetMedia(aiResponseText);
            console.log('Adding media link to tweet text: ' + tweetMediaLink);
            sendText = aiResponseText + ' ' + tweetMediaLink;
        } else {
            console.log('No media link added');
            sendText = aiResponseText;
        }
        //console.log('Send Text: ' + sendText);

        if(sendText.includes('undefined') || sendText.includes('Undefined')) {
            let newsLink = await scrapeNewsLinks(newsSites[getRandomInt(newsSites.length)]);
            sendText = sendText.replace('undefined', newsLink);
            sendText = sendText.replace('Undefined', newsLink);
        }
        console.log('Tag Response Text: ' + sendText);
        return new Promise((resolve, reject) => {
            resolve(sendText);
        });
    } else {
        let newsLinks = await scrapeBreakingNewsLinks(newsSites[getRandomInt(newsSites.length)]);
        let sendText = "#Breaking: " + newsLinks.title + " " + newsLinks.href;
        if(sendText.includes('undefined') || sendText.includes('Undefined') || newsLinks.title == '' || newsLinks.href == '') {
            let newsLink = await scrapeNewsLinks(newsSites[getRandomInt(newsSites.length)]);
            sendText = newsLink;
        }
        console.log('Tag Response Text: ' + sendText);
        return new Promise((resolve, reject) => {
            resolve(sendText);
        });
    }
}

async function getReplyText(originalText, replyAccountName) {
    const myOpenAIApiKey = fs.readFileSync('/home/twitbot/twurlBot/.openAiApiKey', 'utf8');
    const sentiment = botData.sentiment[getRandomInt(botData.sentiment.length)];
    const adder = botData.adder[getRandomInt(botData.adder.length)];
    const configuration = new Configuration({
      apiKey: myOpenAIApiKey.trim(),
    });
    var maxTokens = 70;
    var replyMediaLink;

//    var promptText = "You: Reply to the following tweet in a " + adder + " " + sentiment + " manner and include any similar hashtags: " + originalText + "\nMe:";
    var promptText;
    var randomFlag = getRandomInt(100);
    if(randomFlag > 90) {
        promptText = [
            {"role": "system", "content": "You are a " + adder + " person."},
            {"role": "user", "content": "Reply to the following tweet in a " + adder + " " + sentiment + " manner: " + originalText},
        ];
    } else {
         promptText = [
            {"role": "system", "content": "You are a " + adder + " person with one word responses."},
            {"role": "user", "content": "Reply to the following tweet in a " + adder + " " + sentiment + " manner with one word: " + originalText},
        ];
    }
    /*if(getRandomInt(100) > 65) {
        maxTokens = 40;
    } else {
        maxTokens = 45;
    }*/
    //maxTokens = getRandomIntBetween(13, 46);

    const openai = new OpenAIApi(configuration);
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: promptText,
      temperature: 1.0,
      max_tokens: maxTokens,
      top_p: 1.0,
      frequency_penalty: 2.0,
      presence_penalty: 2.0,
    });
    let aiResponse = await response;
    let aiResponseText = aiResponse.data.choices[0].message.content;
    //await recordReply(promptText[1].content, aiResponseText);
    aiResponseText = aiResponseText.replace(/^"(.*)"$/, '$1');

    //console.log(response);
    var replyText;
    //if(maxTokens == 40) {
    var mediaFlag = getRandomInt(100);
    //if(maxTokens <= 40 && mediaFlag <= 50) {
    for(let i = 0; i < botData.importantNewsTwitterAccounts.length; i++) {
        let botDataName = botData.importantNewsTwitterAccounts[i]
        botDataName = botDataName.replace('@', '');
        compareName = replyAccountName.toLowerCase();
        if(compareName.includes(botDataName)) {
            mediaFlag = 100;
        }
    }
    if(aiResponseText.length < 250 && mediaFlag <= 50) {
        replyMediaLink = await generateTweetMedia(aiResponseText);
        console.log('Adding media link to tweet text: ' + replyMediaLink);
        replyText = aiResponseText + ' ' + replyMediaLink;
    } else {
        console.log('No media link added');
        replyText = aiResponseText;
    }
    if(replyText.includes('undefined') || replyText.includes('Undefined')) {
        let newsLink = await scrapeNewsLinks(newsSites[getRandomInt(newsSites.length)]);
        replyText = replyText.replace('undefined', newsLink);
        replyText = replyText.replace('Undefined', newsLink);
    }

    //replyText = replyText.replace('undefined', '');
    //replyText = replyText.replace('Undefined', '');
    console.log('Original Tweet Text: ' + originalText);
    console.log('Reply Text: ' + replyText);
    return new Promise((resolve, reject) => {
        resolve(replyText);
    });
}
async function generateTweetMedia(text) {
  try {
    var randomFlag = getRandomInt(100);
    if(randomFlag > 85) {
        return new Promise((resolve, reject) => {

        var url = 'https://getyarn.io/yarn-find?text=' + text + '&p=' + getRandomInt(2);
        request(url, async function(err, resp, body){
            if(typeof body == 'string') {
            $ = cheerio.load(body);
            links = $('a'); //jquery get all hyperlinks
            let linkArray = [];
            for(var i = 0; i < links.length; i++) {
                let link = $(links[i]).attr('href');
                if(link && link.includes('yarn-clip') && !linkArray.includes(link)) { linkArray.push(link); }
                if(i >= (links.length - 1)) {
                    var returnLink = 'https://getyarn.io' + linkArray[getRandomInt(linkArray.length)];
                    if(!returnLink.includes('Undefined') && !returnLink.includes('undefined') && typeof returnLink !== 'undefined' && returnLink) {
                        await reportStatus('YarnLink', 'success');
                    } else {
                        await reportStatus('YarnLink', 'failed');
                    }
                        if(!returnLink.includes('Undefined') && !returnLink.includes('undefined') && typeof returnLink !== 'undefined' && returnLink) {
                            resolve(returnLink);
                        } else {
                            resolve('');
                        }
                        //resolve('https://getyarn.io' + linkArray[getRandomInt(linkArray.length)]);
                }
            }
            } else {
               //return new Promise((resolve, reject) => {
                   resolve('');
               //});
            }
        });
        });
    } else if(randomFlag < 15) {
         var yahooUrl = 'https://search.yahoo.com/search?p=' + text + '&fr=news&fr2=p%3Anews%2Cm%3Asb';
         let searchLink = await getYahooSearchLink(yahooUrl);
         if(searchLink.includes('Undefined') || searchLink.includes('undefined')) { 
             await reportStatus('YahooSearchLink', 'failed');
         } else {
             await reportStatus('YahooSearchLink', 'success');
         }
         return new Promise((resolve, reject) => {
             if(searchLink.includes('Undefined') || searchLink.includes('undefined')) {
                 resolve('');
             } else {
                 resolve(searchLink);
             }
         });
    } else if(randomFlag >= 15 && randomFlag < 30) {
        var bingUrl = 'https://www.bing.com/news/search?q=' + text + '&go=Search&qs=ds&form=QBNT';
        let searchLink = await getBingSearchLink(bingUrl);
        if(searchLink.includes('Undefined') || searchLink.includes('undefined')) { 
            await reportStatus('BingSearchLink', 'failed');
        } else {
            await reportStatus('BingSearchLink', 'success');
        }
        return new Promise((resolve, reject) => {
             if(searchLink.includes('Undefined') || searchLink.includes('undefined')) {
                 resolve('');
             } else {
                 resolve(searchLink);
             }
         });
    } else {
        let mediaLink = await scrapeNewsLinks(newsSites[getRandomInt(newsSites.length)]);
        await reportStatus('NewsLink', 'success');
        return new Promise((resolve, reject) => {
            resolve(mediaLink)
        });
    }
  } catch(err) {
    console.log('Error getting tweet media - Error: ' + err);
    resolve('');
  }
}
async function scrapeNewsLinks(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const listItems = $("a");
    var linkArray = [];
    for(var i = 0; i < listItems.length; i++) {
      linkArray.push($(listItems[i]).attr('href'));
      if(i >= (listItems.length - 1)) {
          var filteredArray = linkArray.slice(18,-6);
          filteredArray = filteredArray.filter(e => e !== '#');
          filteredArray = filteredArray.filter(e => !e.includes('category'));
          filteredArray = filteredArray.filter(e => e.includes('-'));
          filteredArray = filteredArray.filter(e => !e.includes('admin'));
          filteredArray = filteredArray.filter(e => !e.includes('about-us'));
          filteredArray = filteredArray.filter(e => !e.includes('privacy-policy'));
          filteredArray = filteredArray.filter(e => !e.includes('contact-us'));
          filteredArray = filteredArray.filter(e => !e.includes('#respond'));
          filteredArray = Array.from(new Set(filteredArray));
          return new Promise((resolve, reject) => {
              resolve(filteredArray[getRandomInt(filteredArray.length)]);
          });
          //console.log(filteredArray);
      }
    }
  } catch (err) {
    console.error(err);
    return new Promise((resolve, reject) => {
        resolve('');
    });
  }
}
function searchString(string, searchTerm) {
    return new Promise((resolve, reject) => {
      	  if(string.includes(searchTerm)) {
            resolve(true);
        } else {
            resolve(false);
        }
    });
}

function selectTags(numberOfTags) {
    var returnArray = [];
    for (let i = 0; i < numberOfTags; i++) {
        let nextTag = tags[getRandomInt(tags.length)];
        if(!returnArray.includes(nextTag)) {
            returnArray.push(nextTag);
        } else {
            i--;
        }
    }
        return returnArray;
}

/*const decryptWithAES = (ciphertext, passphrase) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);
  return originalText;
};*/

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function getRandomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

async function objectKeysToLowercase(objArray) {
    var returnArray = [];
    for(var i = 0; i < objArray.length; i++) {

        var key, keys = Object.keys(objArray[i]);
        var n = keys.length;
        var newobj={}
        while (n--) {
            key = keys[n];
            if(key == "Expires") {
                objArray[i][key] = await getTimestamp(objArray[i][key]);
            }
            newobj[key.toLowerCase()] = objArray[i][key];
            if(n == 0) {
                returnArray.push(newobj);
                if(returnArray.length == objArray.length) {
                    return new Promise((resolve, reject) => {
                        resolve(returnArray);
                    });
                }
            }
        }
    }
}

function getTimestamp(strDate) {
    const dt = new Date(strDate).getTime();
    return new Promise((resolve, reject) => {
        resolve(dt / 1000);
    });
}
async function reportStatus(actionNumber, outcome) {
    console.log('Status update - Action Number: ' + actionNumber + ' Outcome: ' + outcome);
    const client = new Client({
        connectionString: databaseUrl,
        application_name: "twitBotAI"
    });

  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS headless_reporting_tracking (actionnumber STRING, outcome STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    statement = "INSERT INTO headless_reporting_tracking (actionnumber, outcome) VALUES ('" + actionNumber + "', '" + outcome + "')";
    result = await client.query(statement);
    await client.end();
    return true;
  } catch (err) {
    console.log(`error connecting: ${err}`);
    return false;
  }
}
async function updateDatabase(apiKey, isActive) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "twitBotAI"
  });

  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS account_tracking (apikey STRING, active BOOL, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    statement = "SELECT * FROM account_tracking WHERE apikey = '" + apiKey + "'";
    result = await client.query(statement);
    if (result.rowCount > 0) {
        statement = "UPDATE account_tracking SET active = " + isActive + " WHERE apikey = '" + apiKey + "'";
        result = await client.query(statement);
    } else {
        statement = "INSERT INTO account_tracking (active, apikey) VALUES (" + isActive + ", '" + apiKey + "')";
        result = await client.query(statement);
    }
    await client.end();
    return true;
  } catch (err) {
    console.log(`error connecting: ${err}`);
    return false;
  }
}

async function botLog(botName, identifier, text) {
  console.log('Inside BotLog - Identifier: ' + identifier);
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "twitBotLogger"
  });

  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS log_tracking_" + botName + " (id SERIAL PRIMARY KEY, identifier STRING, text STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    //console.log(result);
    statement = "DELETE FROM log_tracking_" + botName + " WHERE identifier != '" + identifier + "'";
    result = await client.query(statement);
    //console.log(result);
    statement = "INSERT INTO log_tracking_" + botName + " (identifier, text) VALUES ('" + identifier + "', '" + text + "')";
    result = await client.query(statement);
    //console.log(result);

    await client.end();
    return true;
  } catch (err) {
    console.log(`error connecting: ${err}`);
    return false;
  }
}

function getYahooSearchLink(url) {
    const selectRandom = () => {
       const userAgents =  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)  AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
                            ];
        var randomNumber = Math.floor(Math.random() * userAgents.length);
        return userAgents[randomNumber];
    }
    let user_agent = selectRandom();
    let header = {
         "User-Agent": `${user_agent}`
    }
    return new Promise((resolve) => {
        unirest
        .get(url)
        .headers({header})
        .then((response) => {
            if(typeof response.body == 'string') {
            let $ = cheerio.load(response.body);
            let links = [];
            $("a").each((i, el) => {
                links[i] = $(el).attr("href");
            });
            const filteredLinks = [];
            for (let i = 0; i < links.length; i++) {
                if(!links[i].includes('yahoo') && !links[i].includes('bing') && links[i] != '#') {
                    filteredLinks.push(links[i]);
                }
                if(i >= (links.length - 1)) {
                    var returnLink = filteredLinks[getRandomInt(filteredLinks.length)];
                    if(returnLink.includes('Undefined') || returnLink.includes('undefined')) {
                        resolve('');
                    } else {
                        resolve(returnLink);
                    }
                    //resolve(filteredLinks[getRandomInt(filteredLinks.length)]);
                }
            }
            } else {
                resolve('');
            }
        });
    });
}

function getBingSearchLink(url) {
    const selectRandom = () => {
       const userAgents =  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)  AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
                            ];
        var randomNumber = Math.floor(Math.random() * userAgents.length);
        return userAgents[randomNumber];
    }
    let user_agent = selectRandom();
    let header = {
         "User-Agent": `${user_agent}`
    }
    return new Promise((resolve) => {
        unirest
        .get(url)
        .headers({header})
        .then((response) => {
            if(typeof response.body == 'string') {
            let $ = cheerio.load(response.body);
            let links = [];
            $("div").each((i, el) => {
                if($(el).attr("url")) {
                    links.push($(el).attr("url"));
                }
            });
            const filteredLinks = [];
            for (let i = 0; i < links.length; i++) {
                filteredLinks.push(links[i]);
                if(i >= (links.length - 1)) {
                    var returnLink = filteredLinks[getRandomInt(filteredLinks.length)];
                    if(returnLink.includes('Undefined') || returnLink.includes('undefined')) {
                        resolve('');
                    } else {
                        resolve(returnLink);
                    }
                }
            }
            } else {
                resolve('');
            }
        });
    });
}
function getRemoteBotData() {
  return new Promise((resolve, reject) => {

    let req = http.get("https://bot.nexislabs.org/public/botData.html", function(res) {
        let data = '',
            json_data;
        res.on('data', function(stream) {
            data += stream;
        });
        res.on('end', function() {
            var decryptedData = decryptWithAES(data, myPassword);
            json_data = JSON.parse(decryptedData);
                        resolve(json_data);
        });
    });
    req.on('error', function(e) {
        console.log(e.message);
    });
  });
}
function getRemoteUntouchableAccounts() {
  return new Promise((resolve, reject) => {

    let req = http.get("https://bot.nexislabs.org/public/untouchableAccounts.html", function(res) {
        let data = '',
            json_data;
        res.on('data', function(stream) {
            data += stream;
        });
        res.on('end', function() {
            var decryptedData = decryptWithAES(data, myPassword);
            json_data = JSON.parse(decryptedData);
                        resolve(json_data);
        });
    });
    req.on('error', function(e) {
        console.log(e.message);
    });
  });
}
async function getImageProfile(username) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "profileScraperAdd"
  });
  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS twitterProfiles (id SERIAL PRIMARY KEY, username STRING, profilename STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    statement = "SELECT * FROM twitterProfiles WHERE username = '" + username + "'";
    result = await client.query(statement);
    if (result.rowCount > 0) {
        console.log('Existing user entry found in database');
        await client.end();
        return new Promise((resolve, reject) => {
            resolve(result.rows[0].profilename);
        });
    } else {
        console.log('No user entry found in database');
        await client.end();
        return new Promise((resolve, reject) => {
            resolve(false);
        });
    }
  } catch (err) {
    console.log(`error connecting: ${err}`);
  }
}
async function recordTweet(input, output) {
    input = input.replace("'", "");
    output = output.replace("'", "");
    console.log('Recording OpenAI Tweet Data - Input: ' + input + ' Output: ' + output);
    const client = new Client({
        connectionString: databaseUrl,
        application_name: "twitBotAI"
    });

  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS openai_tweet_tracking (input STRING, output STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    statement = "INSERT INTO openai_tweet_tracking (input, output) VALUES ('" + input + "', '" + output + "')";
    result = await client.query(statement);
    await client.end();
    return new Promise((resolve, reject) => {
        resolve(true);
    });
  } catch (err) {
    console.log(`error connecting: ${err}`);
    return new Promise((resolve, reject) => {
        resolve(false);
    });
  }
}
async function recordReply(input, output) {
    input = input.replace("'", "");
    output = output.replace("'", "");
    console.log('Recording OpenAI Reply Data - Input: ' + input + ' Output: ' + output);
    const client = new Client({
        connectionString: databaseUrl,
        application_name: "twitBotAI"
    });

  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS openai_reply_tracking (input STRING, output STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    statement = "INSERT INTO openai_reply_tracking (input, output) VALUES ('" + input + "', '" + output + "')";
    result = await client.query(statement);
    await client.end();
    return new Promise((resolve, reject) => {
        resolve(true);
    });
  } catch (err) {
    console.log(`error connecting: ${err}`);
    return new Promise((resolve, reject) => {
        resolve(false);
    });
  }
}
async function getProfilePhoto(name) {
  return new Promise(async(resolve, reject) => {
    let profileFilename = await download.image({url: 'https://bot.nexislabs.org/api/randomPhoto/' + name, dest: '/home/twitbot/twurlBot/logs/profile.jpg'});
    resolve(profileFilename);
  });
}
async function getBannerPhoto(name) {
  return new Promise(async(resolve, reject) => {
    let bannerFilename = await download.image({url: 'https://bot.nexislabs.org/api/randomPhoto/' + name, dest: '/home/twitbot/twurlBot/logs/banner.jpg'});
    resolve(bannerFilename);
  });
}
async function getRandomPhoto(name) {
  return new Promise(async(resolve, reject) => {
    let randomFilename = await download.image({url: 'https://bot.nexislabs.org/api/randomPhoto/' + name, dest: '/home/twitbot/twurlBot/logs/random.jpg'});
    resolve(randomFilename);
  });
}
async function getRandomProfileData() {
    return new Promise((resolve, reject) => {

    let req = http.get("https://bot.nexislabs.org/api/randomProfile/", function(res) {
        let data = '',
            json_data;
        res.on('data', function(stream) {
            data += stream;
        });
        res.on('end', function() {
            json_data = JSON.parse(data);
            resolve(json_data);
        });
    });
    req.on('error', function(e) {
        console.log(e.message);
    });
  });
}
async function checkForTwitterDuplicateProfileUse(profileName) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "profileScraperCheck"
  });
  //var tableName = 'twitter_' + profileName;
  var tableName = 'twitterProfiles';
  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS twitterProfiles (id SERIAL PRIMARY KEY, username STRING, profilename STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    statement = "SELECT * FROM " + tableName + " WHERE profilename = '" + profileName + "'";
    result = await client.query(statement);
    if (result.rowCount > 0) {
        console.log('Duplicate profile usage');
        return new Promise((resolve, reject) => {
            resolve(true);
        });
    } else {
        console.log('Duplicate profile usage does not exist');
        return new Promise((resolve, reject) => {
            resolve(false);
        });
    }
    await client.end();
  } catch (err) {
    console.log(`error connecting: ${err}`);
    console.log('Duplicate profile usage does not exist');
    return new Promise((resolve, reject) => {
        resolve(false);
    });
  }
}
async function checkForTwitterDuplicateAccountUse(profileName) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "profileScraperCheck"
  });
  //var tableName = 'twitter_' + profileName;
  var tableName = 'twitterProfiles';
  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS twitterProfiles (id SERIAL PRIMARY KEY, username STRING, profilename STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    statement = "SELECT * FROM " + tableName + " WHERE username = '" + profileName + "'";
    result = await client.query(statement);
    if (result.rowCount > 0) {
        console.log('Duplicate account usage');
        return new Promise((resolve, reject) => {
            resolve(true);
        });
    } else {
        console.log('Duplicate account usage does not exist');
        return new Promise((resolve, reject) => {
            resolve(false);
        });
    }
    await client.end();
  } catch (err) {
    console.log(`error connecting: ${err}`);
    console.log('Duplicate profile usage does not exist');
    return new Promise((resolve, reject) => {
        resolve(false);
    });
  }
}
async function addMediaUseToDatabase(username, profileName) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "profileScraperAdd"
  });
  try {
    await client.connect();
    let statement = "CREATE TABLE IF NOT EXISTS twitterProfiles (id SERIAL PRIMARY KEY, username STRING, profilename STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    let result = await client.query(statement);
    statement = "SELECT * FROM twitterProfiles WHERE username = '" + username + "'";
    result = await client.query(statement);
    if (result.rowCount > 0) {
        console.log('Updating existing user entry in database');
        statement = "UPDATE twitterProfiles SET (profilename) = ('" + profileName + "') WHERE username = '" + username + "'";
    } else {
        console.log('Adding user entry in database');
        statement = "INSERT INTO twitterProfiles (username, profileName) VALUES ('" + username + "', '" + profileName + "')";
    }
    result = await client.query(statement);
    return new Promise((resolve, reject) => {
        resolve(true);
    });
    await client.end();
  } catch (err) {
    console.log(`error connecting: ${err}`);
  }
}
function getGenderFromName(name) {
    return new Promise((resolve, reject) => {
    let gender = getGender(name);
    if(gender == 'unknown') {
        let splitName = name.split(/(?=[A-Z])/);
        let combinedName = '';
        for(var i = 0; i < splitName.length; i++) {
            combinedName += (splitName[i] + ' ');
            if(i == (splitName.length - 1)) {
                console.log('Combined Name: ' + combinedName);
                gender = getGender(combinedName);
                if(gender == 'unknown') {
                    gender = 'female';
                    console.log('Gender cannot be determined - defaulting to female');
                    //console.log('Gender: ' + gender);
                    resolve(gender);
                } else {
                    //console.log('Gender: ' + gender);
                    resolve(gender);
                }
            } else {
                resolve('female');
            }
        }
    } else {
        //console.log('Gender: ' + gender);
        resolve(gender);
    }
    });
}
async function scrapeBreakingNewsLinks(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const listItems = $("a");
    var linkArray = [];
    for(var i = 0; i < listItems.length; i++) {
      linkArray.push({href: $(listItems[i]).attr('href'), title: $(listItems[i]).attr('title')});
      if(i >= (listItems.length - 1)) {
          var filteredArray = linkArray.slice(18,-6);
          filteredArray = filteredArray.filter(e => e.href !== '#');
          filteredArray = filteredArray.filter(e => !e.href.includes('category'));
          filteredArray = filteredArray.filter(e => e.href.includes('-'));
          filteredArray = filteredArray.filter(e => !e.href.includes('admin'));
          filteredArray = filteredArray.filter(e => !e.href.includes('about-us'));
          filteredArray = filteredArray.filter(e => !e.href.includes('privacy-policy'));
          filteredArray = filteredArray.filter(e => !e.href.includes('contact-us'));
          filteredArray = filteredArray.filter(e => !e.href.includes('#respond'));
          filteredArray = Array.from(new Set(filteredArray));
          await reportStatus('BreakingNewsLink', 'success');
          return new Promise((resolve, reject) => {
              resolve(filteredArray[getRandomInt(filteredArray.length)]);
          });
          //console.log(filteredArray);
      }
    }
  } catch (err) {
    console.error(err);
    await reportStatus('BreakingNewsLink', 'failed');
    return new Promise((resolve, reject) => {
        resolve({href: '', title: ''});
    });
  }
}
module.exports = { getRandomPhoto, getGenderFromName, addMediaUseToDatabase, getTwitterBio, getRandomProfileData, checkForTwitterDuplicateProfileUse, checkForTwitterDuplicateAccountUse, getRemoteUntouchableAccounts, getProfilePhoto, getBannerPhoto, getImageProfile, reportStatus, botLog, getReplyText, updateDatabase, getTimestamp, objectKeysToLowercase, getRandomIntBetween, getRandomInt, selectTags, searchString, getTweetText, databaseUrl, myPassword }
