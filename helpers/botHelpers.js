const {Client } = require("pg");
const axios = require('axios');
const fs = require('fs');
const http = require('https');
const unirest = require("unirest");
const { Configuration, OpenAIApi } = require("openai");
const databaseUrl = fs.readFileSync('/home/twitbot/twitBotAI/.databaseurl', 'utf8');
const myPassword = fs.readFileSync('/home/twitbot/twitBotAI/.password', 'utf8');
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

async function getTweetText() {
    const myOpenAIApiKey = fs.readFileSync('/home/twitbot/twurlBot/.openAiApiKey', 'utf8');
    const sentiment = botData.sentiment[getRandomInt(botData.sentiment.length)];
    const adder = botData.adder[getRandomInt(botData.adder.length)];
    const requestStatement = botData.requestStatements[getRandomInt(botData.requestStatements.length)];
    const configuration = new Configuration({
      apiKey: myOpenAIApiKey.trim(),
    });

    var promptText;
    var maxTokens = 45;
    var tweetMediaLink;

    let tagArray = selectTags(5);
    let tagText = tagArray.join(' ');

    var randomFlag = getRandomInt(100);
    if(randomFlag > 90) {
        promptText = "You: Create a " + adder + " " + sentiment + " tweet about how your day is going and include hashtags similar to the following: " + tagText + "\nMe:";
    } else if (randomFlag > 25 && randomFlag <= 90) {
        promptText = "You: Create a " + adder + " " + sentiment + " tweet about the following while using different words and some of the same hashtags: " + tagText + "\nMe:";
    } else {
        promptText = "You: " + requestStatement + " using a " + adder + " " + sentiment + " tone\nMe:";
    }

    if(getRandomInt(100) > 65) {
        maxTokens = 42;
    } else {
        maxTokens = 45;
    }
        const openai = new OpenAIApi(configuration);
        const response = await openai.createCompletion({
          model: "text-davinci-003",
          prompt: promptText,
          temperature: 1.0,
          max_tokens: maxTokens,
          top_p: 1.0,
          frequency_penalty: 2.0,
          presence_penalty: 2.0,
        });
        let aiResponse = await response;
        let aiResponseText = aiResponse.data.choices[0].text;

        tagArray = selectTags(getRandomIntBetween(1, 3));
        var sendText;
        if(maxTokens == 42) {
            //tweetMediaLink = await generateTweetMedia(response.data.choices[0].text);
            tweetMediaLink = await generateTweetMedia(aiResponseText);
            console.log('Adding media link to tweet text: ' + tweetMediaLink);
            sendText = aiResponseText + ' ' + tweetMediaLink;
        } else {
            console.log('No media link added');
            sendText = aiResponseText;
        }
        if(sendText.includes('undefined') || sendText.includes('Undefined')) {
            let newsLink = await scrapeNewsLinks(newsSites[getRandomInt(newsSites.length)]);
            sendText = sendText.replace('undefined', newsLink);
            sendText = sendText.replace('Undefined', newsLink);
        }
        console.log('Tag Response Text: ' + sendText);
        return new Promise((resolve, reject) => {
            resolve(sendText);
        });
}

async function getReplyText(originalText) {
    const myOpenAIApiKey = fs.readFileSync('/home/twitbot/twurlBot/.openAiApiKey', 'utf8');
    const sentiment = botData.sentiment[getRandomInt(botData.sentiment.length)];
    const adder = botData.adder[getRandomInt(botData.adder.length)];
    const configuration = new Configuration({
      apiKey: myOpenAIApiKey.trim(),
    });
    var maxTokens = 45;
    var replyMediaLink;

    var promptText = "You: Reply to the following tweet in a " + adder + " " + sentiment + " manner and include any similar hashtags: " + originalText + "\nMe:";

    if(getRandomInt(100) > 65) {
        maxTokens = 42;
    } else {
        maxTokens = 45;
    }
    const openai = new OpenAIApi(configuration);
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: promptText,
      temperature: 1.0,
      max_tokens: maxTokens,
      top_p: 1.0,
      frequency_penalty: 2.0,
      presence_penalty: 2.0,
    });
    let aiResponse = await response;
    let aiResponseText = aiResponse.data.choices[0].text;

    //console.log(response);
    var replyText;
    if(maxTokens == 42) {
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
                        await reportStatus('YarnLink', 'failed');
                    } else {
                        await reportStatus('YarnLink', 'success');
                    }
                    return new Promise((resolve, reject) => {
                        if(!returnLink.includes('Undefined') && !returnLink.includes('undefined') && typeof returnLink !== 'undefined' && returnLink) {
                            resolve(returnLink);
                        } else {
                            resolve('');
                        }
                        //resolve('https://getyarn.io' + linkArray[getRandomInt(linkArray.length)]);
                    });
                }
            }
            } else {
               return new Promise((resolve, reject) => {
                   resolve('');
               });
            }
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
module.exports = { reportStatus, botLog, getReplyText, updateDatabase, getTimestamp, objectKeysToLowercase, getRandomIntBetween, getRandomInt, selectTags, searchString, getTweetText, databaseUrl, myPassword }
