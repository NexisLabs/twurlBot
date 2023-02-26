const { getImageProfile, reportStatus, botLog, getReplyText, updateDatabase, getTimestamp, objectKeysToLowercase, getRandomIntBetween, getRandomInt, selectTags, searchString, getTweetText, databaseUrl, myPassword } = require('/home/twitbot/twurlBot/helpers/botHelpers.js');
const {Client } = require("pg");
const axios = require('axios');
const http = require('https');
const fs = require('fs');
const proxyChain = require('proxy-chain');
const executablePath = require('puppeteer').executablePath();
const { Configuration, OpenAIApi } = require("openai");
const puppeteer = require('puppeteer-extra')
const request = require("request");
const CryptoJS = require('crypto-js');
const phoneapikey = '31L4HGaqnv1SDgc-4mJL9CYC-Hwbm64hn-9mrsaL25-amw4v1dtdHmhvNg';
const profilesPath = '/mnt/blockstorage/twitbot/profileScraping/instagramProfiles/';

//const botData = require('/home/twitbot/twurlBot/botData.json');
//const tags = botData.tags;
var loginArray, botData, tags;

const botName = process.argv[2];
console.log('Starting Bot - Name: ' + botName + ' PID: ' + process.pid);

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

async function start() {
    botData = await getRemoteBotData();
    tags = botData.tags

    loginArray = await getRemoteLogins();
    let randomAccount = loginArray[getRandomInt(loginArray.length)];
    let imageProfileName = await getImageProfile(randomAccount.email);
    if(imageProfileName != false) {
        console.log('Image Profile: ' + imageProfileName);
    } else {
        console.log('Image Profile Not Found');
    }
    await twitterLogin(imageProfileName, randomAccount.username, randomAccount.password, randomAccount.email, randomAccount.useragent, randomAccount.proxy);
    process.exit(0);
}

// random delay, then start running!
//let randomDelay = getRandomInt(300000);
//console.log('Delaying runtime by ' + (randomDelay/1000) + ' seconds');
//setTimeout(() => {
    start();
//}, randomDelay)

const decryptWithAES = (ciphertext, passphrase) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);
  return originalText;
};
async function gracefulExit(browser, proxyChain, proxyUrl, message) {
    await reportStatus('Login', 'failed');
    await reportStatus('Complete', 'failed');
    await browser.close();
    await proxyChain.closeAnonymizedProxy(proxyUrl, true);
    console.log('Graceful exit initiated - ' + message);
    process.exit(1);
}

async function twitterLogin (imageProfileName, username, password, email, useragent, proxyString) {
    console.log('Account Selected: ' + username);
    console.log('Proxy Selected: ' + proxyString);

    try {
    var proxyArray = proxyString.split(':');
    var proxyData = 'http://' + proxyArray[2] + ':' + proxyArray[3] + '@' + proxyArray[0] + ':' + proxyArray[1];
    const proxyUrl = await proxyChain.anonymizeProxy(proxyData);
    const browser = await puppeteer.launch({ headless: true, executablePath: executablePath, args: [`--proxy-server=${proxyUrl}`] });
    const context = browser.defaultBrowserContext();
    context.overridePermissions("https://twitter.com", ["geolocation", "notifications"]);
    context.overridePermissions("https://www.twitter.com", ["geolocation", "notifications"]);
    const page = (await browser.pages())[0];
    await page.setUserAgent(useragent);
    await page.setDefaultNavigationTimeout(300000);

    await page.goto('https://twitter.com/login', {waitUntil: 'networkidle0'});
    let loginStatus = await customWaitForText(page, 'Phone, email, or username', 200, 'login');
    if (loginStatus){
        console.log('Login page loaded correctly - Starting sign-in process');
    } else { gracefulExit(browser, proxyChain, proxyUrl, 'Login page is down - Exiting'); }

    await page.waitForSelector('input[autocomplete="username"]');
    await page.type('input[autocomplete="username"]', username, { delay: 200 });
    const [nextButton] = await page.$x("//span[contains(., 'Next')]");
    if (nextButton) {
        await nextButton.click();
    } else { gracefulExit(browser, proxyChain, proxyUrl, 'Login page next button not found - Exiting'); }
    await page.waitForTimeout(4000)

    await page.type('input[autocomplete="current-password"]', password, { delay: 200 });

    const [loginButton] = await page.$x("//span[contains(., 'Log in')]");
    if (loginButton) {
        await loginButton.click();
    } else { gracefulExit(browser, proxyChain, proxyUrl, 'Login button not found - Exiting'); }

    await page.waitForTimeout(20000);
    await checkForCookiesButton(page);
    let html = await page.content();

    //let emailVerifyStatus = await searchString(html, 'Verify your identity by entering the email address associated with your Twitter account');
    //if(emailVerifyStatus){ gracefulExit(browser, proxyChain, proxyUrl, 'Account needs email verification - Exiting'); }
    //let html = await page.content();
    let emailVerifyStatus = await searchString(html, 'Verify your identity by entering the email address associated with your Twitter account');
    if(emailVerifyStatus){
        console.log('Account needs email verification');
        await page.waitForSelector('input[autocomplete="email"]');
        console.log('Email Input Found!');
        await page.type('input[autocomplete="email"]', email, { delay: 200 });
        const [emailNextButton] = await page.$x("//span[contains(., 'Next')]");
        if (emailNextButton) {
            console.log('Email Next Button Found!');
            await emailNextButton.click();
        }
        await page.waitForTimeout(20000)
    }

    let suspendedStatus = await searchString(html, 'permanently suspended');
    if(suspendedStatus){ gracefulExit(browser, proxyChain, proxyUrl, 'Account is permanently suspended - Exiting'); }

    let postEmailHtml = await page.content();
    let welcomeBackStatus = await searchString(postEmailHtml, 'Welcome back');
    let successfulStatus = await searchString(postEmailHtml, 'What’s happening?');
    let lockedVerifyStatus = await searchString(postEmailHtml, 'Your account has been locked');
    let authenticationStatus = await searchString(postEmailHtml, 'arkose_iframe');
    let phoneVerifyStatus = await searchString(postEmailHtml, 'Enter your phone number');

    if(welcomeBackStatus || successfulStatus){
        console.log('Account login successful!');
        await checkForCookiesButton(page);
        await updateDatabase(username, true);
        const actionConstant = 10000;
        await reportStatus('Login', 'success');

        // actionFlag10 - For Account Tweets
        try {
        var actionFlag10 = getRandomInt(actionConstant);
        if(actionFlag10 < (botData.standardTweetRate * actionConstant)) {
            await page.goto('https://twitter.com/compose/tweet');
            await page.waitForTimeout(20000)
            await checkForCookiesButton(page);

            const closeButtons = await page.$$('div[aria-label="Close"]');
            if(closeButtons && closeButtons.length) {
                console.log(closeButtons.length + ' close buttons found');
                for(let i = 0; i < closeButtons.length; i++){
                    console.log('Close button detected');
                    await closeButtons[i].click();
                    await page.waitForTimeout(5000)
                    //console.log('Close button clicked');
                    console.log('Close button clicked - Number: ' + i);
                }
            }
            await page.goto('https://twitter.com/compose/tweet');
            await page.waitForTimeout(20000)
            await checkForCookiesButton(page);

            const [maybeLaterButton] = await page.$x("//span[contains(., 'Maybe later')]");
            if (maybeLaterButton) {
                console.log('Maybe later button detected...clicking');
                await maybeLaterButton.click();
                await page.waitForTimeout(1000)
            }

            const [innactiveTweetButton] = await page.$x("//span[contains(., 'Tweet')]");
            if (innactiveTweetButton) {
                console.log('Innactive Tweet Button Found!');
                await innactiveTweetButton.click();
                await page.waitForTimeout(1000)
            }
            const [tweetTextBox] = await page.$x("//div[contains(., 'happening?')]");
            if (tweetTextBox) {
                console.log('Tweet text box found');
                await tweetTextBox.click({ delay: 500 });
                let pictureFlag = getRandomInt(100);
                //if(true) {
                if(imageProfileName != false && pictureFlag >= 90) {
                    try{
                        let randomImage = getRandomImage(imageProfileName);
                        if(randomImage != false) {
                            //var imageUploadInput = await page.$x('input[data-testid="fileInput"]');
                            var imageUploadButton = await page.$('div[aria-label="Add photos or video"]');
                            if(imageUploadButton) {
                                console.log('Image Upload Button Found!');
                                const imageInput = await page.evaluateHandle(el => el.nextElementSibling, imageUploadButton);
                                await imageInput.uploadFile(randomImage);
                                console.log('Image upload successful');
                                await reportStatus('ImageUpload', 'success');
                            } else {
                                await reportStatus('ImageUpload', 'failed');
                                console.log('Image upload failed - image upload button');
                                let tweetText = await getTweetText();
                                await tweetTextBox.type(tweetText, { delay: 200 });
                            }
                        } else {
                            console.log('Image upload failed - randomImage');
                            await reportStatus('ImageUpload', 'failed');
                            let tweetText = await getTweetText();
                            await tweetTextBox.type(tweetText, { delay: 200 });
                        }
                    }catch(err) {
                        console.log('Image upload failed - catch block');
                        await reportStatus('ImageUpload', 'failed');
                        let tweetText = await getTweetText();
                        await tweetTextBox.type(tweetText, { delay: 200 });
                    }
                } else {
                    let tweetText = await getTweetText();
                    await tweetTextBox.type(tweetText, { delay: 200 });
                }
            }
            console.log('Tweet text entered');
            await page.waitForTimeout(5000)
            await page.keyboard.press('Enter');
            await page.waitForTimeout(5000)
            await page.keyboard.press('Enter');
            await page.waitForTimeout(5000)

            const [tweetButton] = await page.$x("//span[contains(., 'Tweet')]");
            if (tweetButton) {
                console.log('Send Tweet Button Found!');
                await tweetButton.click();
            }
            console.log('Tweet Sent!');
            await reportStatus('10', 'success');
            await page.waitForTimeout(10000)
        }
        }catch(err) {
            console.log('10 Caught Error: ' + err);
            await reportStatus('10', 'failed');
        }

        // actionFlag3.1 - For Group Replies
        try {
        var actionFlag3_1 = getRandomInt(actionConstant);
        if(actionFlag3_1 < (botData.groupReplyRate * actionConstant)) {
            console.log('Action 3.1 - groupReplyRate Triggered');
            var loopCount = 5;
            while(loopCount > 0) {
            loopCount--;
            var groupAccountToReply = loginArray[getRandomInt(loginArray.length)].username;
            await page.goto('https://twitter.com/' + groupAccountToReply);
            await page.waitForTimeout(60000)
            await checkForCookiesButton(page);
            let preGroupReplyHtml = await page.content();
            let groupReplyStatus1 = await searchString(preGroupReplyHtml, 'aria-label="Follow @' + groupAccountToReply);
            let groupReplyStatus2 = await searchString(preGroupReplyHtml, 'aria-label="Following @' + groupAccountToReply);
            var groupReplyButtons = await page.$$('div[data-testid="reply"]');
            await page.waitForTimeout(10000)
            if(groupReplyButtons && (groupReplyStatus1 || groupReplyStatus2)) {
                console.log('Group reply buttons detection successful - Count: ' + groupReplyButtons.length);
                var upperLimit = 5;
                if(groupReplyButtons.length < 5) { upperLimit = groupReplyButtons.length; }
                let randomReply = getRandomInt(upperLimit);
                await page.waitForTimeout(10000);
                await groupReplyButtons[randomReply].click({delay: 5000});
                console.log('Successfully clicked group reply button - Index: ' + randomReply);
                await page.waitForTimeout(30000);

                const tweetTextArray = await page.evaluate(() => {
                    const tds = Array.from(document.querySelectorAll('div[data-testid="tweetText"]'))
                    return tds.map(td => td.textContent)
                });
                const originalTweetText = tweetTextArray[randomReply + 1];
                if(originalTweetText) {
                    console.log('Original tweet text found - Text: ' + originalTweetText);
                    let replyText = await getReplyText(originalTweetText);
                    console.log('Reply text generated - Reply: ' + replyText);
                    //const [replyTextBox] = await page.$x('div[aria-label="Tweet text"]');
                    //const [tweetTextBox] = await page.$x("//div[contains(., 'happeni')]");
                    const [replyTextBox] = await page.$x("//div[contains(., 'Tweet your reply')]");
                    if (replyTextBox) {
                        console.log('Reply text box found');
                        await replyTextBox.click({ delay: 500 });
                        await replyTextBox.type(replyText, { delay: 200 });
                        console.log('Reply text entered');
                        await page.waitForTimeout(10000)
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(10000)
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(30000)

                        //const [replyButton] = await page.$x("//span[contains(., 'Reply')]");
                        const [replyButton] = await page.$x("//span[contains(., 'Reply')]");
                        //const replyButton = await page.$x('div[data-testid="tweetButton"]');
                        // data-testid="tweetButton"
                        if (replyButton) {
                            console.log('Send Reply Button Found!');
                            await replyButton.click();
                            console.log('Reply Sent!');
                            await reportStatus('3_1', 'success');
                            await page.waitForTimeout(10000)
                            break;
                        } else {
                            console.log('Send Reply Button Not Found');
                            await reportStatus('3_1', 'failed');
                        }
                    } else {
                        console.log('Reply Text Box Not Found');
                        await reportStatus('3_1', 'failed');
                    }
                } else {
                    console.log('Original Text Not Found');
                    await reportStatus('3_1', 'failed');
                }
            } else {
                console.log('Reply Buttons Not Found For ' + groupAccountToReply);
                await reportStatus('3_1', 'failed');
            }
            } // end of while
        }
        }catch(err) {
            console.log('3_1 Caught Error: ' + err);
            await reportStatus('3_1', 'failed');
        }

        // actionFlag6.1 - For Random Replies
        try {
        var actionFlag6_1 = getRandomInt(actionConstant);
        if(actionFlag6_1 < (botData.randomReplyRate * actionConstant)) {
            console.log('Action 6.1 - randomReplyRate Triggered');
            let followerList = await getFollowerList();
            console.log('Follower List Received - Length: ' + followerList.length);

            var loopCount = 5;
            while(loopCount > 0) {
            loopCount--;
            var randomAccountToReply = followerList[getRandomInt(followerList.length)].username;
            await page.goto('https://twitter.com/' + randomAccountToReply);
            await page.waitForTimeout(60000)
            await checkForCookiesButton(page);
            let preRandomReplyHtml = await page.content();
            let randomReplyStatus1 = await searchString(preRandomReplyHtml, 'aria-label="Follow @' + randomAccountToReply);
            let randomReplyStatus2 = await searchString(preRandomReplyHtml, 'aria-label="Following @' + randomAccountToReply);
            var randomReplyButtons = await page.$$('div[data-testid="reply"]');
            await page.waitForTimeout(10000)
            if(randomReplyButtons && (randomReplyStatus1 || randomReplyStatus2)) {
                console.log('Random reply buttons detection successful - Count: ' + randomReplyButtons.length);
                var upperLimit = 5;
                if(randomReplyButtons.length < 5) { upperLimit = randomReplyButtons.length; }
                let randomReply = getRandomInt(upperLimit);
                await page.waitForTimeout(10000);
                await randomReplyButtons[randomReply].click({delay: 5000});
                console.log('Successfully clicked random reply button - Index: ' + randomReply);
                await page.waitForTimeout(30000);

                const tweetTextArray = await page.evaluate(() => {
                    const tds = Array.from(document.querySelectorAll('div[data-testid="tweetText"]'))
                    return tds.map(td => td.textContent)
                });
                const originalTweetText = tweetTextArray[randomReply + 1];
                if(originalTweetText) {
                    console.log('Original tweet text found - Text: ' + originalTweetText);
                    let replyText = await getReplyText(originalTweetText);
                    console.log('Reply text generated - Reply: ' + replyText);
                    //const [replyTextBox] = await page.$x('div[aria-label="Tweet text"]');
                    const [replyTextBox] = await page.$x("//div[contains(., 'Tweet your reply')]");
                    if (replyTextBox) {
                        console.log('Reply text box found');
                        await replyTextBox.click({ delay: 500 });
                        await replyTextBox.type(replyText, { delay: 200 });
                        console.log('Reply text entered');
                        await page.waitForTimeout(10000)
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(10000)
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(30000)
                        //const replyButton = await page.$x('div[data-testid="tweetButton"]');
                        const [replyButton] = await page.$x("//span[contains(., 'Reply')]");
                        if (replyButton) {
                            console.log('Send Reply Button Found!');
                            await replyButton.click();
                            console.log('Reply Sent!');
                            await reportStatus('6_1', 'success');
                            await page.waitForTimeout(10000)
                            break;
                        } else {
                            console.log('Send Reply Button Not Found');
                            await reportStatus('6_1', 'failed');
                        }
                    } else {
                        console.log('Reply Text Box Not Found');
                        await reportStatus('6_1', 'failed');
                    }
                } else {
                    console.log('Original Text Text Not Found');
                    await reportStatus('6_1', 'failed');
                }
            } else {
                console.log('Reply Buttons Not Found For ' + randomAccountToReply);
                await reportStatus('6_1', 'failed');
            }
            } // end of while loop
        }
        }catch(err) {
            console.log('6_1 Caught Error: ' + err);
            await reportStatus('6_1', 'failed');
        }

        // actionFlag9.1 - For Important Replies
        try {
        var actionFlag9_1 = getRandomInt(actionConstant);
        if(actionFlag9_1 < (botData.importantReplyRate * actionConstant)) {
            console.log('Action 9.1 - importantReplyRate Triggered');
            var loopCount = 5;
            while(loopCount > 0) {
            loopCount--;
            var importantAccountToReply = botData.importantTwitterAccounts[getRandomInt(botData.importantTwitterAccounts.length)];
            await page.goto('https://twitter.com/' + importantAccountToReply);
            await page.waitForTimeout(60000)
            await checkForCookiesButton(page);
            let preImportantReplyHtml = await page.content();
            let importantReplyStatus1 = await searchString(preImportantReplyHtml, 'aria-label="Follow ' + importantAccountToReply);
            let importantReplyStatus2 = await searchString(preImportantReplyHtml, 'aria-label="Following ' + importantAccountToReply);
            var importantReplyButtons = await page.$$('div[data-testid="reply"]');
            await page.waitForTimeout(10000)
            if(importantReplyButtons && (importantReplyStatus1 || importantReplyStatus2)) {
                console.log('Important reply buttons detection successful - Count: ' + importantReplyButtons.length);
                var upperLimit = 5;
                if(importantReplyButtons.length < 5) { upperLimit = importantReplyButtons.length; }
                let randomReply = getRandomInt(upperLimit);
                await page.waitForTimeout(10000);
                await importantReplyButtons[randomReply].click({delay: 5000});
                console.log('Successfully clicked important reply button - Index: ' + randomReply);
                await page.waitForTimeout(30000);

                const tweetTextArray = await page.evaluate(() => {
                    const tds = Array.from(document.querySelectorAll('div[data-testid="tweetText"]'))
                    return tds.map(td => td.textContent)
                });
                const originalTweetText = tweetTextArray[randomReply + 1];
                if(originalTweetText) {
                    console.log('Original tweet text found - Text: ' + originalTweetText);
                    let replyText = await getReplyText(originalTweetText);
                    console.log('Reply text generated - Reply: ' + replyText);
                    //const [replyTextBox] = await page.$x('div[aria-label="Tweet text"]');
                    const [replyTextBox] = await page.$x("//div[contains(., 'Tweet your reply')]");
                    if (replyTextBox) {
                        console.log('Reply text box found');
                        await replyTextBox.click({ delay: 500 });
                        await replyTextBox.type(replyText, { delay: 200 });
                        console.log('Reply text entered');
                        await page.waitForTimeout(10000)
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(10000)
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(30000)
                        //const replyButton = await page.$x('div[data-testid="tweetButton"]');
                        const [replyButton] = await page.$x("//span[contains(., 'Reply')]");
                        if (replyButton) {
                            console.log('Send Reply Button Found!');
                            await replyButton.click();
                            console.log('Reply Sent!');
                            await reportStatus('9_1', 'success');
                            await page.waitForTimeout(10000)
                            break;
                        } else {
                            console.log('Send Reply Button Not Found');
                            await reportStatus('9_1', 'failed');
                        }
                    } else {
                        console.log('Reply Text Box Not Found');
                        await reportStatus('9_1', 'failed');
                    }
                } else {
                    console.log('Original Text Text Not Found');
                    await reportStatus('9_1', 'failed');
                }
            } else {
                console.log('Reply Buttons Not Found For ' + importantAccountToReply);
                await reportStatus('9_1', 'failed');
            }
            } // end of while loop
        }
        }catch(err) {
            console.log('9_1 Caught Error: ' + err);
            await reportStatus('9_1', 'failed');
        }

        // actionFlag1 - For Group Follows
        try {
        var actionFlag1 = getRandomInt(actionConstant);
        if(actionFlag1 < (botData.groupFollowRate * actionConstant)) {
            console.log('Action 1 - groupFollowRate Triggered');
            var groupAccountToFollow = loginArray[getRandomInt(loginArray.length)].username;
            await page.goto('https://twitter.com/' + groupAccountToFollow);
            await page.waitForTimeout(30000)
            await checkForCookiesButton(page);
            let preGroupFollowHtml = await page.content();
            let groupFollowStatus = await searchString(preGroupFollowHtml, 'aria-label="Follow @' + groupAccountToFollow);
            const [groupFollowButton] = await page.$x("//span[contains(., 'Follow')]");
            if(groupFollowStatus && groupFollowButton){
                console.log('Follow Button Found For ' + groupAccountToFollow);
                await groupFollowButton.click({delay: 5000});
                console.log('Group Follow Successful For ' + groupAccountToFollow);
                await reportStatus('1', 'success');
                await page.waitForTimeout(10000)
            } else {
                console.log('Follow Button Not Found For ' + groupAccountToFollow);
                await reportStatus('1', 'failure');
            }
        }
        }catch(err) {
            console.log('1 Caught Error: ' + err);
            await reportStatus('1', 'failed');
        }

        // actionFlag2 - For Group Likes
        try {
        var actionFlag2 = getRandomInt(actionConstant);
        if(actionFlag2 < (botData.groupLikeRate * actionConstant)) {
            console.log('Action 2 - groupLikeRate Triggered');
            var groupAccountToLike = loginArray[getRandomInt(loginArray.length)].username;
            await page.goto('https://twitter.com/' + groupAccountToLike);
            await page.waitForTimeout(30000)
            await checkForCookiesButton(page);
            let preGroupLikeHtml = await page.content();
            let groupLikeStatus1 = await searchString(preGroupLikeHtml, 'aria-label="Follow @' + groupAccountToLike);
            let groupLikeStatus2 = await searchString(preGroupLikeHtml, 'aria-label="Following @' + groupAccountToLike);
            var groupLikeButtons = await page.$$('div[data-testid="like"]');
            if(groupLikeButtons && (groupLikeStatus1 || groupLikeStatus2)) {
                console.log('Group like buttons detection successful - Count: ' + groupLikeButtons.length);
                var upperLimit = 5;
                if(groupLikeButtons.length < 5) { upperLimit = groupLikeButtons.length; }
                let randomLikesAmount = getRandomIntBetween(1, upperLimit);
                for(var i = 0; i < randomLikesAmount; i++) {
                    await page.waitForTimeout(10000);
                    await groupLikeButtons[0].click({delay: 5000});
                    console.log('Successfully liked group member tweet - Count: ' + i);
                    await reportStatus('2', 'success');
                    await page.waitForTimeout(10000);
                    groupLikeButtons = await page.$$('div[data-testid="like"]');
                }
            } else {
                console.log('Like Buttons Not Found For ' + groupAccountToLike);
                await reportStatus('2', 'failed');
            }
        }
        }catch(err) {
            console.log('2 Caught Error: ' + err);
            await reportStatus('2', 'failed');
        }

        // actionFlag3 - For Group Retweets
        try {
        var actionFlag3 = getRandomInt(actionConstant);
        if(actionFlag3 < (botData.groupRetweetRate * actionConstant)) {
            console.log('Action 3 - groupRetweetRate Triggered');
            var groupAccountToRetweet = loginArray[getRandomInt(loginArray.length)].username;
            await page.goto('https://twitter.com/' + groupAccountToRetweet);
            await page.waitForTimeout(30000)
            await checkForCookiesButton(page);
            let preGroupRetweetHtml = await page.content();
            let groupRetweetStatus1 = await searchString(preGroupRetweetHtml, 'aria-label="Follow @' + groupAccountToRetweet);
            let groupRetweetStatus2 = await searchString(preGroupRetweetHtml, 'aria-label="Following @' + groupAccountToRetweet);
            var groupRetweetButtons = await page.$$('div[data-testid="retweet"]');
            if(groupRetweetButtons && (groupRetweetStatus1 || groupRetweetStatus2)) {
                console.log('Group retweet buttons detection successful - Count: ' + groupRetweetButtons.length);
                var upperLimit = 4;
                if(groupRetweetButtons.length < 4) { upperLimit = groupRetweetButtons.length; }
                let randomRetweetsAmount = getRandomIntBetween(1, upperLimit);
                for(var i = 0; i < randomRetweetsAmount; i++) {
                    await page.waitForTimeout(10000);
                    await groupRetweetButtons[0].click({delay: 5000});
                    console.log('Successfully clicked group retweet button - Count: ' + i);
                    await page.waitForTimeout(5000);
                    const [groupRetweetButton] = await page.$x("//span[contains(., 'Retweet')]");
                    if(groupRetweetButton) {
                        console.log('Group retweet button confirmation found');
                        await page.waitForTimeout(10000);
                        await groupRetweetButton.click({delay: 5000});
                        await page.waitForTimeout(5000);
                        console.log('Group retweet confirmation button clicked - retweet successful');
                        await reportStatus('3', 'success');
                    } else {
                        console.log('Group retweet confirmation button not found');
                        await reportStatus('3', 'failed');
                    }
                    groupRetweetButtons = await page.$$('div[data-testid="retweet"]');
                }
            } else {
                console.log('Retweet Buttons Not Found For ' + groupAccountToRetweet);
                await reportStatus('3', 'failed');
            }
        }
        }catch(err) {
            console.log('3 Caught Error: ' + err);
            await reportStatus('3', 'failed');
        }

        // actionFlag4 - For Random Follow
        try {
        var actionFlag4 = getRandomInt(actionConstant);
        await checkForCookiesButton(page);
        if(actionFlag4 < (botData.randomFollowRate * actionConstant)) {
            console.log('Action 4 - randomFollowRate Triggered');
            let followerList = await getFollowerList();
            console.log('Follower List Received - Length: ' + followerList.length);
            var randomArraySize = getRandomIntBetween(2,6);
            for(var i = 0; i < randomArraySize; i++) {
                let randomFollowerName = followerList[getRandomInt(followerList.length)].username;
                console.log('Attempting to add follower - Username: ' + randomFollowerName);
                await page.goto('https://twitter.com/' + randomFollowerName);

                let randomFollowStatus = await customWaitForText(page, 'aria-label="Follow @' + randomFollowerName, 40, 'preRandomFollow');
                const [randomFollowButton] = await page.$x("//span[contains(., 'Follow')]");
                if(randomFollowStatus && randomFollowButton){
                    await checkForCookiesButton(page);
                    console.log('Follow Button Found For ' + randomFollowerName);
                    await randomFollowButton.click({delay: 5000});
                    console.log('Random Follow Successful For ' + randomFollowerName);
                    await reportStatus('4', 'success');
                    await page.waitForTimeout(10000)
                } else {
                    console.log('Random Follow Failed For ' + randomFollowerName);
                    await reportStatus('4', 'failed');
                }
            }
        }
        }catch(err) {
            console.log('4 Caught Error: ' + err);
            await reportStatus('4', 'failed');
        }

        // actionFlag5 - For Random Likes
        try {
        var actionFlag5 = getRandomInt(actionConstant);
        if(actionFlag5 < (botData.randomLikeRate * actionConstant)) {
            console.log('Action 5 - randomLikeRate Triggered');
            let followerList = await getFollowerList();
            console.log('Follower List Received - Length: ' + followerList.length);
            var randomAccountToLike = followerList[getRandomInt(followerList.length)].username;
            await page.goto('https://twitter.com/' + randomAccountToLike);
            await page.waitForTimeout(30000)
            await checkForCookiesButton(page);
            let preRandomLikeHtml = await page.content();
            let randomLikeStatus1 = await searchString(preRandomLikeHtml, 'aria-label="Follow @' + randomAccountToLike);
            let randomLikeStatus2 = await searchString(preRandomLikeHtml, 'aria-label="Following @' + randomAccountToLike);
            var randomLikeButtons = await page.$$('div[data-testid="like"]');
            if(randomLikeButtons && (randomLikeStatus1 || randomLikeStatus2)) {
                console.log('Random like buttons detection successful - Count: ' + randomLikeButtons.length);
                var upperLimit = 5;
                if(randomLikeButtons.length < 5) { upperLimit = randomLikeButtons.length; }
                let randomLikesAmount = getRandomIntBetween(1, upperLimit);
                for(var i = 0; i < randomLikesAmount; i++) {
                    await page.waitForTimeout(10000);
                    await randomLikeButtons[0].click({delay: 5000});
                    console.log('Successfully liked random member tweet - Count: ' + i);
                    await reportStatus('5', 'success');
                    await page.waitForTimeout(10000);
                    randomLikeButtons = await page.$$('div[data-testid="like"]');
                }
            } else {
                console.log('Like Buttons Not Found For ' + randomAccountToLike);
                await reportStatus('5', 'failed');
            }
        }
        }catch(err) {
            console.log('5 Caught Error: ' + err);
            await reportStatus('5', 'failed');
        }

        // actionFlag6 - For Random Retweets
        try {
        var actionFlag6 = getRandomInt(actionConstant);
        if(actionFlag6 < (botData.randomRetweetRate * actionConstant)) {
            console.log('Action 6 - randomRetweetRate Triggered');
            let followerList = await getFollowerList();
            console.log('Follower List Received - Length: ' + followerList.length);
            var randomAccountToRetweet = followerList[getRandomInt(followerList.length)].username;
            await page.goto('https://twitter.com/' + randomAccountToRetweet);
            await page.waitForTimeout(30000)
            await checkForCookiesButton(page);
            let preRandomRetweetHtml = await page.content();
            let randomRetweetStatus1 = await searchString(preRandomRetweetHtml, 'aria-label="Follow @' + randomAccountToRetweet);
            let randomRetweetStatus2 = await searchString(preRandomRetweetHtml, 'aria-label="Following @' + randomAccountToRetweet);
            var randomRetweetButtons = await page.$$('div[data-testid="retweet"]');
            if(randomRetweetButtons && (randomRetweetStatus1 || randomRetweetStatus2)) {
                console.log('Random retweet buttons detection successful - Count: ' + randomRetweetButtons.length);
                var upperLimit = 4;
                if(randomRetweetButtons.length < 4) { upperLimit = randomRetweetButtons.length; }
                let randomRetweetsAmount = getRandomIntBetween(1, upperLimit);
                for(var i = 0; i < randomRetweetsAmount; i++) {
                    await page.waitForTimeout(10000);
                    await randomRetweetButtons[0].click({delay: 5000});
                    console.log('Successfully clicked random retweet button - Count: ' + i);
                    await page.waitForTimeout(5000);
                    const [randomRetweetButton] = await page.$x("//span[contains(., 'Retweet')]");
                    if(randomRetweetButton) {
                        console.log('Random retweet button confirmation found');
                        await page.waitForTimeout(10000);
                        await randomRetweetButton.click({delay: 5000});
                        await page.waitForTimeout(5000);
                        console.log('Random retweet confirmation button clicked - retweet successful');
                        await reportStatus('6', 'success');
                    } else {
                        console.log('Random retweet confirmation button not found');
                        await reportStatus('6', 'failed');
                    }
                    randomRetweetButtons = await page.$$('div[data-testid="retweet"]');
                }
            } else {
                console.log('Retweet Buttons Not Found For ' + randomAccountToRetweet);
                await reportStatus('6', 'failed');
            }
        }
        }catch(err) {
            console.log('6 Caught Error: ' + err);
            await reportStatus('6', 'failed');
        }

        // actionFlag7 - For Important Account Follow
        try {
        var actionFlag7 = getRandomInt(actionConstant);
        if(actionFlag7 < (botData.importantFollowRate * actionConstant)) {
            console.log('Action 7 - importantFollowRate Triggered');
            var importantAccountToFollow = botData.importantTwitterAccounts[getRandomInt(botData.importantTwitterAccounts.length)];
            await page.goto('https://twitter.com/' + importantAccountToFollow);
            await page.waitForTimeout(30000)
            await checkForCookiesButton(page);
            let preImportantFollowHtml = await page.content();
            let importantFollowStatus = await searchString(preImportantFollowHtml, 'aria-label="Follow ' + importantAccountToFollow);
            const [importantFollowButton] = await page.$x("//span[contains(., 'Follow')]");
            if(importantFollowStatus && importantFollowButton){
                console.log('Follow Button Found For ' + importantAccountToFollow);
                await importantFollowButton.click({delay: 5000});
                console.log('Important Follow Successful For ' + importantAccountToFollow);
                await reportStatus('7', 'success');
                await page.waitForTimeout(10000)
            } else {
                console.log('Follow Button Not Found For ' + importantAccountToFollow);
                await reportStatus('7', 'failed');
            }
        }
        }catch(err) {
            console.log('7 Caught Error: ' + err);
            await reportStatus('7', 'failed');
        }

        // actionFlag8 - For Important Account Likes
        try {
        var actionFlag8 = getRandomInt(actionConstant);
        if(actionFlag8 < (botData.importantLikeRate * actionConstant)) {
            console.log('Action 8 - importantLikeRate Triggered');
            var importantAccountToLike = botData.importantTwitterAccounts[getRandomInt(botData.importantTwitterAccounts.length)];
            await page.goto('https://twitter.com/' + importantAccountToLike);
            await page.waitForTimeout(30000)
            await checkForCookiesButton(page);
            let preImportantLikeHtml = await page.content();
            let importantLikeStatus1 = await searchString(preImportantLikeHtml, 'aria-label="Follow ' + importantAccountToLike);
            let importantLikeStatus2 = await searchString(preImportantLikeHtml, 'aria-label="Following ' + importantAccountToLike);
            var importantLikeButtons = await page.$$('div[data-testid="like"]');
            if(importantLikeButtons && (importantLikeStatus1 || importantLikeStatus2)) {
                console.log('Important like buttons detection successful - Count: ' + importantLikeButtons.length);
                var upperLimit = 5;
                if(importantLikeButtons.length < 5) { upperLimit = importantLikeButtons.length; }
                let randomLikesAmount = getRandomIntBetween(1, upperLimit);
                for(var i = 0; i < randomLikesAmount; i++) {
                    await page.waitForTimeout(10000);
                    await importantLikeButtons[0].click({delay: 5000});
                    console.log('Successfully liked important member tweet - Count: ' + i);
                    await reportStatus('8', 'success');
                    await page.waitForTimeout(10000);
                    importantLikeButtons = await page.$$('div[data-testid="like"]');
                }
            } else {
                console.log('Like Buttons Not Found For ' + importantAccountToLike);
                await reportStatus('8', 'failed');
            }
        }
        }catch(err) {
            console.log('8 Caught Error: ' + err);
            await reportStatus('8', 'failed');
        }

        // actionFlag9 - For Important Account Retweets
        try {
        var actionFlag9 = getRandomInt(actionConstant);
        if(actionFlag9 < (botData.importantRetweetRate * actionConstant)) {
            console.log('Action 9 - importantRetweetRate Triggered');
            var importantAccountToRetweet = botData.importantTwitterAccounts[getRandomInt(botData.importantTwitterAccounts.length)];
            await page.goto('https://twitter.com/' + importantAccountToRetweet);
            await page.waitForTimeout(30000)
            await checkForCookiesButton(page);
            let preImportantRetweetHtml = await page.content();
            let importantRetweetStatus1 = await searchString(preImportantRetweetHtml, 'aria-label="Follow ' + importantAccountToRetweet);
            let importantRetweetStatus2 = await searchString(preImportantRetweetHtml, 'aria-label="Following ' + importantAccountToRetweet);
            var importantRetweetButtons = await page.$$('div[data-testid="retweet"]');
            if(importantRetweetButtons && (importantRetweetStatus1 || importantRetweetStatus2)) {
                console.log('Important retweet buttons detection successful - Count: ' + importantRetweetButtons.length);
                var upperLimit = 4;
                if(importantRetweetButtons.length < 4) { upperLimit = importantRetweetButtons.length; }
                let randomRetweetsAmount = getRandomIntBetween(1, upperLimit);
                for(var i = 0; i < randomRetweetsAmount; i++) {
                    await page.waitForTimeout(10000);
                    await importantRetweetButtons[0].click({delay: 5000});
                    console.log('Successfully clicked important retweet button - Count: ' + i);
                    await page.waitForTimeout(5000);
                    const [importantRetweetButton] = await page.$x("//span[contains(., 'Retweet')]");
                    if(importantRetweetButton) {
                        console.log('Important retweet button confirmation found');
                        await page.waitForTimeout(10000);
                        await importantRetweetButton.click({delay: 5000});
                        await page.waitForTimeout(5000);
                        console.log('Important retweet confirmation button clicked - retweet successful');
                        await reportStatus('9', 'success');
                    } else {
                        console.log('Important retweet confirmation button not found');
                        await reportStatus('9', 'failed');
                    }
                    importantRetweetButtons = await page.$$('div[data-testid="retweet"]');
                }
            } else {
                console.log('Retweet Buttons Not Found For ' + importantAccountToRetweet);
                await reportStatus('9', 'failed');
            }
        }
        }catch(err) {
            console.log('9 Caught Error: ' + err);
            await reportStatus('9', 'failed');
        }
    } else if(phoneVerifyStatus){
        console.log('Phone number verification needed');
        await updateDatabase(username, false);
        gracefulExit(browser, proxyChain, proxyUrl, 'Phone number verification needed - Exiting');
    } else if(lockedVerifyStatus || authenticationStatus){
        console.log('Account locked - likely needs captcha intervention');
        await updateDatabase(username, false);
        gracefulExit(browser, proxyChain, proxyUrl, 'Account locked - likely needs captcha intervention - Exiting');
    } else {
        await updateDatabase(username, false);
        console.log('Unknown login error');
        gracefulExit(browser, proxyChain, proxyUrl, 'Unknown login error - Exiting');
    }
    await browser.close();
    await proxyChain.closeAnonymizedProxy(proxyUrl, true);
    await reportStatus('Complete', 'success');
    return new Promise((resolve, reject) => {
        resolve(true)
    });
    }catch(err) {
        await reportStatus('Login', 'failure');
        gracefulExit(browser, proxyChain, proxyUrl, err);
    }
}
function getLogins(fileLocation) {
    var csv = fs.readFileSync(fileLocation)
    var array = csv.toString().split("\n");
    let result = [];
    for (let i = 0; i < (array.length); i++) {
        var account = array[i].split(",");
        let obj = {username: account[0], email: account[1], password: account[2], proxy: account[3], useragent: account[12]}
        result.push(obj);
        if(i >= (array.length - 1)) {
            return new Promise((resolve, reject) => {
                resolve(result);
            });
        }
    }
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
            //console.log(json_data);
            //console.log(decryptedData);
            //var array = json_data.toString().split("\n");
            //let result = [];
            //for (let i = 0; i < (array.length); i++) {
            //    var account = array[i].split(",");
            //    let obj = {username: account[0], email: account[1], password: account[2], proxy: account[3], useragent: account[12]}
           //     result.push(obj);
           //     if(i >= (array.length - 1)) {
                        resolve(json_data);
           //     }
           // }
        });
    });
    req.on('error', function(e) {
        console.log(e.message);
    });
  });
}
function getRemoteLogins() {
  return new Promise((resolve, reject) => {
    let req = http.get("https://bot.nexislabs.org/public/exportedAccounts.html", function(res) {
        let data = '',
            json_data;
        res.on('data', function(stream) {
            data += stream;
        });
        res.on('end', function() {
            var decryptedData = decryptWithAES(data, myPassword);
            json_data = JSON.parse(decryptedData);
            var array = json_data.toString().split("\n");
            let result = [];
            for (let i = 0; i < (array.length); i++) {
                var account = array[i].split(",");
                let obj = {username: account[0], email: account[1], password: account[2], proxy: account[3], useragent: account[12]}
                result.push(obj);
                if(i >= (array.length - 1)) {
                        resolve(result);
                }
            }
        });
    });
    req.on('error', function(e) {
        console.log(e.message);
    });
  });
}
const delay = (t, val) => new Promise(resolve => setTimeout(resolve, t, val));
async function autoScroll(page){
    var totalScrolls = 30;
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                totalScrolls--;
                if(totalHeight >= scrollHeight - window.innerHeight || totalScrolls == 0){
                    clearInterval(timer);
                    resolve();
                }
            }, 2000);
        });
    });
}
async function getFollowerList() {
    const dbClient = new Client({
        connectionString: databaseUrl,
        application_name: "$ docs_quickstart_node"
    });

    await dbClient.connect();
    let statement = "SELECT * FROM follower_list_data"
    let result = await dbClient.query(statement);
    await dbClient.end();
    return new Promise((resolve, reject) => {
        if (result.rowCount > 0) {
            console.log('Follower List Received - Count: ' + result.rowCount);
            //let randomFollowerId = result.rows[getRandomInt(result.rowCount)].id
            //let response = await client.v2.follow(userID.data.id, randomFollowerId);
            resolve(result.rows);
        } else {
            reject(false);
        }
    });
}
async function checkForCookiesButton(page) {
    const [cookiesButton] = await page.$x("//span[contains(., 'Accept all cookies')]");
    if (cookiesButton) {
        console.log('Cookies Button Found - Accepting Cookies');
        //botLog(botName, process.pid, 'Cookies Button Found - Accepting Cookies');
        await cookiesButton.click();
        return new Promise((resolve, reject) => {
            resolve(true);
        });
    } else {
        return new Promise((resolve, reject) => {
            resolve(false);
        });
    }
}
async function customWaitForText(page, text, seconds, customName) {
    for(var i = 0; i < (seconds / 10); i++) {
        await page.waitForTimeout(10000)
        //await page.screenshot({path: '/home/twitbot/twurlBot/logs/' + customName + 'Screenshot.jpg', fullPage: true})
        let html = await page.content();
        //fs.writeFileSync('/home/twitbot/twurlBot/logs/'+ customName +'Log.txt', html);
        let status = await searchString(html, text);
        if(status) {
            console.log(customName + ' screen loaded - Done waiting');
            //botLog(botName, process.pid, customName + ' screen loaded - Done waiting');
            return new Promise((resolve, reject) => {
                resolve(true);
            });
        } else {
            console.log('Still waiting for ' + customName + ' screen - Seconds waited so far: ' + (i * 10));
            //botLog(botName, process.pid, 'Still waiting for ' + customName + ' screen - Seconds waited so far: ' + (i * 10));
        }
        if(i == ((seconds / 10) - 1)) {
            return new Promise((resolve, reject) => {
                resolve(false);
            });
        }
    }
}
function getRandomImage(profile) {
    const profilePath = profilesPath + profile;
    const images = fs.readdirSync(profilePath + '/images');
    if(!images || images.length < 5) {
        console.log('Invalid images...exiting');
        return false;
        //process.exit(1);
    } else {
        return profilePath + '/images/' + images[getRandomInt(images.length)];
    }
}
