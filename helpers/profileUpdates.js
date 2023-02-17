const { botLog, getReplyText, updateDatabase, getTimestamp, objectKeysToLowercase, getRandomIntBetween, getRandomInt, decryptWithAES, selectTags, searchString, getTweetText, databaseUrl, myPassword } = require('/home/twitbot/twurlBot/helpers/botHelpers.js');
const {Client } = require("pg");
const fs = require('fs');
const { readFileSync } = require('fs');
const unirest = require("unirest");
const { Configuration, OpenAIApi } = require("openai");
const { getGender } = require('gender-detection-from-name');
const myOpenAIApiKeyLocal = fs.readFileSync('/home/twitbot/twurlBot/.openAiApiKey', 'utf8');
//const databaseUrl = fs.readFileSync('/home/twitbot/twitBotAI/.databaseurl', 'utf8');
//const myPassword = fs.readFileSync('/home/twitbot/twitBotAI/.password', 'utf8');
const botData = require('/home/twitbot/twurlBot/botData.json');
const tags = botData.tags;
const request = require('request');
const cheerio = require('cheerio');

const profilesPath = '/mnt/blockstorage/twitbot/profileScraping/instagramProfiles/';


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
function getProfileName(profile) {
    const profilePath = profilesPath + profile;
    const profileDataRaw = readFileSync(profilePath + '/profileData.json');
    const profileData = JSON.parse(profileDataRaw);
    return new Promise((resolve, reject) => {
        resolve(profileData.name);
    });
}
function getRandomProfile() {
    const profiles = fs.readdirSync(profilesPath);
    return randomDirectory = profiles[getRandomInt(profiles.length)];
}
function getRandomImage(profile) {
    const profilePath = profilesPath + profile;
    const images = fs.readdirSync(profilePath + '/images');
    if(!images || images.length < 5) {
        console.log('Invalid images...exiting');
        process.exit(1);
    } else {
        return profilePath + '/images/' + images[getRandomInt(images.length)];
    }
}
function getRandomVideo(profile) {
    const profilePath = profilesPath + profile;
    const videos = fs.readdirSync(profilePath + '/videos');
    return profilePath + '/videos/' + videos[getRandomInt(videos.length)];
}

async function checkForDuplicateProfileUse(profile) {
    return new Promise((resolve, reject) => {
        resolve(sendText);
    });
}
async function getTwitterBio(gender, bioTopics) {
    const sentiment = botData.sentiment[getRandomInt(botData.sentiment.length)];
    const adder = botData.adder[getRandomInt(botData.adder.length)];
    const configuration = new Configuration({
      apiKey: myOpenAIApiKeyLocal,
    });
    var maxTokens = 26;
    var replyMediaLink;

    var promptText = "You: Create a twitter bio for a " + gender + " related to the following topics without naming gender in response: " + bioTopics + "\nMe:";

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
    //console.log(response);
    var bioText = response.data.choices[0].text;
    //console.log('Original Bio Topics: ' + bioTopics);
    //console.log('Created Bio: ' + bioText);
    return new Promise((resolve, reject) => {
        resolve(bioText);
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
async function checkDuplicateImageUse(profileName, name) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "profileScraperCheck"
  });
  var tableName = 'twitter_' + profileName;
  var key = 'name';
  var value = name;
  try {
    await client.connect();
    let statement = "SELECT * FROM " + tableName + " WHERE " + key +" = '" + value + "'";
    let result = await client.query(statement);
    if (result.rowCount > 0) {
        console.log('Duplicate image value exists');
        return new Promise((resolve, reject) => {
            resolve(true);
        });
    } else {
        console.log('Duplicate image value does not exist');
        return new Promise((resolve, reject) => {
            resolve(false);
        });
    }
    await client.end();
  } catch (err) {
    console.log(`error connecting: ${err}`);
  }
}
async function addMediaUseToDatabase(username, profileName) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "profileScraperAdd"
  });
  //var tableName = 'twitter_' + profileName;
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
    //statement = "CREATE TABLE IF NOT EXISTS " + tableName + " (id SERIAL PRIMARY KEY, type STRING, name STRING, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
    //result = await client.query(statement);
    //statement = "INSERT INTO " + tableName + " (type, name) VALUES ('" + mediaType + "', '" + name + "')";
    //result = await client.query(statement);
    return new Promise((resolve, reject) => {
        resolve(true);
    });
    await client.end();
  } catch (err) {
    console.log(`error connecting: ${err}`);
  }
}

/*let profile = getRandomProfile();
let randomVideo = getRandomVideo(profile);
let randomImage = getRandomImage(profile);
console.log(randomVideo);
console.log(randomImage);
*/
/*
let randomProfileImagesPath = profilesPath + randomDirectory + '/images';
let randomProfileVideosPath = profilesPath + randomDirectory + '/videos';
let images = fs.readdirSync(randomProfileImagesPath);
let videos = fs.readdirSync(randomProfileVideosPath);

let randomImagePath = randomProfileImagesPath + '/' + images[getRandomInt(images.length)];
let randomVideoPath = randomProfileVideosPath + '/' + videos[getRandomInt(videos.length)];
console.log(randomImagePath);
console.log(randomVideoPath);
*/

module.exports = { checkForTwitterDuplicateAccountUse, checkDuplicateImageUse, checkForTwitterDuplicateProfileUse, getTwitterBio, getGenderFromName, getProfileName, addMediaUseToDatabase, getRandomProfile, getRandomImage, getRandomVideo };
