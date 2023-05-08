 const { getRandomPhoto, getGenderFromName, addMediaUseToDatabase, getTwitterBio, getRandomProfileData, checkForTwitterDuplicateProfileUse, checkForTwitterDuplicateAccountUse, getRemoteUntouchableAccounts, getBannerPhoto, getProfilePhoto, getImageProfile, reportStatus, botLog, getReplyText, updateDatabase, getTimestamp, objectKeysToLowercase, getRandomIntBetween, getRandomInt, selectTags, searchString, getTweetText, databaseUrl, myPassword } = require('./helpers/botHelpers.js');
const { Client } = require('pg')
const axios = require('axios')
const Fakerator = require('fakerator')
const http = require('https')
const fs = require('fs')
const proxyChain = require('proxy-chain')
const executablePath = require('puppeteer').executablePath()
const { Configuration, OpenAIApi } = require('openai')
const puppeteer = require('puppeteer-extra')
const request = require('request')
const CryptoJS = require('crypto-js')
let loginArray, botData, tags

const botName = process.argv[2]
console.log('Starting Bot - Name: ' + botName + ' PID: ' + process.pid)

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

async function initialize () {
  botData = await getRemoteBotData()
  tags = botData.tags
  loginArray = await getRemoteLogins()
  start();
  start();
}
async function start() {
  while (true) {
    const randomAccount = loginArray[getRandomInt(loginArray.length)]
    await twitterLogin(randomAccount.username, randomAccount.password, randomAccount.email, randomAccount.useragent, randomAccount.proxy)
  }
}
initialize();
//start()
//botStart();

const decryptWithAES = (ciphertext, passphrase) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase)
  const originalText = bytes.toString(CryptoJS.enc.Utf8)
  return originalText
}
async function gracefulExit (browser, proxyChain, proxyUrl, message) {
  await reportStatus('Login', 'failed')
  await reportStatus('Complete', 'failed')
  await browser.close()
  await proxyChain.closeAnonymizedProxy(proxyUrl, true)
  console.log('Graceful exit initiated - ' + message)
  //start()
  // process.exit(1);
}

async function twitterLogin (username, password, email, useragent, proxyString) {
  console.log('Account Selected: ' + username)
  console.log('Proxy Selected: ' + proxyString)
  const proxyArray = proxyString.split(':')
  const proxyData = 'http://' + proxyArray[2] + ':' + proxyArray[3] + '@' + proxyArray[0] + ':' + proxyArray[1]
  const proxyUrl = await proxyChain.anonymizeProxy(proxyData)
  const browser = await puppeteer.launch({ headless: true, executablePath, args: [`--proxy-server=${proxyUrl}`] })

  try {
    const context = browser.defaultBrowserContext()
    context.overridePermissions('https://twitter.com', ['geolocation', 'notifications'])
    context.overridePermissions('https://www.twitter.com', ['geolocation', 'notifications'])
    const page = (await browser.pages())[0]
    await page.setUserAgent(useragent)
    await page.setDefaultNavigationTimeout(30000)

    await page.goto('https://twitter.com/login', { waitUntil: 'networkidle0' })
    const loginStatus = await customWaitForText(page, 'Phone, email, or username', 20, 'login')
    if (loginStatus) {
      console.log('Login page loaded correctly - Starting sign-in process')
    } else { gracefulExit(browser, proxyChain, proxyUrl, 'Login page is down - Exiting') }

    await page.waitForSelector('input[autocomplete="username"]')
    await page.type('input[autocomplete="username"]', username, { delay: 20 })
    const [nextButton] = await page.$x("//span[contains(., 'Next')]")
    if (nextButton) {
      await nextButton.click()
    } else { gracefulExit(browser, proxyChain, proxyUrl, 'Login page next button not found - Exiting') }
    await page.waitForTimeout(1000)

    await page.type('input[autocomplete="current-password"]', password, { delay: 20 })

    const [loginButton] = await page.$x("//span[contains(., 'Log in')]")
    if (loginButton) {
      await loginButton.click()
    } else { gracefulExit(browser, proxyChain, proxyUrl, 'Login button not found - Exiting') }

    await customWaitForText(page, 'happening?', 20, 'straightLogin')
    await checkForCookiesButton(page)
    const html = await page.content()

    const emailVerifyStatus = await searchString(html, 'Verify your identity by entering the email address associated with your Twitter account')
    if (emailVerifyStatus) {
      console.log('Account needs email verification')
      await page.waitForSelector('input[autocomplete="email"]')
      console.log('Email Input Found!')
      await page.type('input[autocomplete="email"]', email, { delay: 20 })
      const [emailNextButton] = await page.$x("//span[contains(., 'Next')]")
      if (emailNextButton) {
        console.log('Email Next Button Found!')
        await emailNextButton.click()
      }
      await customWaitForText(page, 'happening?', 20, 'straightLoginEmail')
    }

    const suspendedStatus = await searchString(html, 'permanently suspended')
    if (suspendedStatus) { gracefulExit(browser, proxyChain, proxyUrl, 'Account is permanently suspended - Exiting') }

    const postEmailHtml = await page.content()
    const welcomeBackStatus = await searchString(postEmailHtml, 'Welcome back')
    const successfulStatus = await searchString(postEmailHtml, 'What’s happening?')
    const lockedVerifyStatus = await searchString(postEmailHtml, 'Your account has been locked')
    const authenticationStatus = await searchString(postEmailHtml, 'arkose_iframe')
    const phoneVerifyStatus = await searchString(postEmailHtml, 'Enter your phone number')

    if (welcomeBackStatus || successfulStatus) {
      console.log('Account login successful!')
      await checkForCookiesButton(page)
      //await updateDatabase(username, true)
      const actionConstant = 10000
      await reportStatus('Login', 'success')

      // Action 10 - Send Tweet
      //if (getRandomInt(actionConstant) < (botData.standardTweetRate * actionConstant)) {
        const sendTweetFlag = await sendTweet(page)
        if (sendTweetFlag == true) {
          await reportStatus('10', 'success')
          console.log('10 Success')
        } else {
          await reportStatus('10', 'failed')
          console.log('10 Failed')
        }
      //}

      // Action 3.1 - Group Reply
      //if (getRandomInt(actionConstant) < (botData.groupReplyRate * actionConstant)) {
      const groupReplyRandomInt = getRandomIntBetween(2, 6);
      for(let i = 0; i < groupReplyRandomInt; i++) {
        const tweetReply = await getRandomReply()
        const groupReplyFlag = await sendReply(page, tweetReply[0], tweetReply[1])
        if (groupReplyFlag == true) {
          await reportStatus('3_1', 'success')
          console.log('3_1 Success')
        } else {
          await reportStatus('3_1', 'failed')
          console.log('3_1 Failed')
        }
      }
      //}
      // Action 3.1 - Group Reply
      //if (getRandomInt(actionConstant) < (botData.groupReplyRate * actionConstant)) {
      const tweetLikesRetweets = await getRandomReply()
      const likeRetweetFlag = await sendLikesRetweets(page, tweetLikesRetweets[0], tweetLikesRetweets[1])
      if (likeRetweetFlag == true) {
        //await reportStatus('3_1', 'success')
        console.log('Like/Retweet Success')
      } else {
        //await reportStatus('3_1', 'failed')
        console.log('Like/Retweet Failed')
      }
      //}

    } else if (phoneVerifyStatus) {
      console.log('Phone number verification needed')
      await updateDatabase(username, false)
      gracefulExit(browser, proxyChain, proxyUrl, 'Phone number verification needed - Exiting')
    } else if (lockedVerifyStatus || authenticationStatus) {
      console.log('Account locked - likely needs captcha intervention')
      await updateDatabase(username, false)
      gracefulExit(browser, proxyChain, proxyUrl, 'Account locked - likely needs captcha intervention - Exiting')
    } else {
      await updateDatabase(username, false)
      console.log('Unknown login error')
      gracefulExit(browser, proxyChain, proxyUrl, 'Unknown login error - Exiting')
    }
    await browser.close()
    await proxyChain.closeAnonymizedProxy(proxyUrl, true)
    await reportStatus('Complete', 'success')
    return new Promise((resolve, reject) => {
      resolve(true)
    })
  } catch (err) {
    console.log(err);
    await reportStatus('Login', 'failure')
    gracefulExit(browser, proxyChain, proxyUrl, err);
    return new Promise((resolve, reject) => {
      resolve(false)
    })
  }
}
async function getRandomReply() {
  return new Promise(async(resolve, reject) => {
    let req = http.get("https://bot.nexislabs.org/api/randomReply/", function(res) {
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
async function sendLikesRetweets (page, tweetUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(tweetUrl, { waitUntil: 'networkidle2' })
      await checkForCookiesButton(page)
      try{
      const likeButtons = await page.$$('div[data-testid="like"]');
      const randomLikeButtonsInt = getRandomIntBetween(2, 7);
      if(likeButtons) {
        console.log('Like button detection successful - Count: ' + likeButtons.length);
        for(let i = 0; i < Math.min(likeButtons.length, randomLikeButtonsInt); i++) {
          await likeButtons[i].click({delay: 100});
          console.log('Like click successful - Index: ' + i)
        }
      }
      }catch(err) {
        console.log('Like action error detected: ' + err);
      }

      try{
      const retweetButtons = await page.$$('div[data-testid="retweet"]');
      const randomRetweetButtonsInt = getRandomIntBetween(2, 7);
      if(retweetButtons) {
        console.log('Retweet button detection successful - Count: ' + retweetButtons.length);
        for(let i = 0; i < Math.min(retweetButtons.length, randomRetweetButtonsInt); i++) {
          await retweetButtons[i].click({delay: 100});
          console.log('Retweet click successful - Index: ' + i)
        }
      }
      }catch(err) {
        console.log('Retweet action error detected: ' + err);
      }
      resolve(true);
    } catch (err) {
      console.log('Like/Retweet Caught Error: ' + err)
      resolve(false)
    }
  })
}

async function sendReply (page, tweetUrl, replyText) {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(tweetUrl, { waitUntil: 'networkidle2' })
      await checkForCookiesButton(page)
      //const preReplyHtml = await page.content()
      //const preReplyStatus = await searchString(preReplyHtml, 'Replying to @')

      // let textBox = await page.$$('div[data-testid="tweetTextarea_0"]');

      const [replyTextBox] = await page.$x("//div[contains(., 'Tweet your reply')]")
      if (replyTextBox && replyTextBox) {
        console.log('Reply text box & button found')
        await replyTextBox.click({ delay: 1000 })
        await replyTextBox.type(replyText, { delay: 100 })
        console.log('Reply text entered')
        console.log('Reply text: ' + replyText);
        console.log('Tweet Url: ' + tweetUrl);
        const [replyButton] = await page.$x("//span[contains(., 'Reply')]")

        //await page.evaluate((element) => {
        //  element.click()
        //}, replyButton)

        await page.waitForTimeout(100)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(100)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(100)
        //const [replyButton] = await page.$x('div[data-testid="tweetButtonInline"]');

        if (replyButton) {
          console.log('Send Reply Button Found!')
          await replyButton.click()
          console.log('Reply Sent!')
          resolve(true)
        } else {
          console.log('Send Reply Button Not Found')
          resolve(false)
        }
      } else {
        console.log('Reply Text Box Not Found')
        resolve(false)
      }

    } catch (err) {
      console.log('Reply Caught Error: ' + err)
      resolve(false)
    }
  })
}

async function sendTweet (page) {
  return new Promise(async (resolve, reject) => {
    try {
      await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2' })
      await customWaitForText(page, 'happening?', 20, '10')
      await checkForCookiesButton(page)

      const closeButtons = await page.$$('div[aria-label="Close"]')
      if (closeButtons && closeButtons.length) {
        console.log(closeButtons.length + ' close buttons found')
        for (let i = 0; i < closeButtons.length; i++) {
          console.log('Close button detected')
          await closeButtons[i].click()
          //await page.waitForTimeout(5000)
          console.log('Close button clicked - Number: ' + i)
        }
      }
      await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2' })
      await customWaitForText(page, 'happening?', 20, '10')
      await checkForCookiesButton(page)

      const [maybeLaterButton] = await page.$x("//span[contains(., 'Maybe later')]")
      if (maybeLaterButton) {
        console.log('Maybe later button detected...clicking')
        await maybeLaterButton.click()
        //await page.waitForTimeout(1000)
      }

      const [innactiveTweetButton] = await page.$x("//span[contains(., 'Tweet')]")
      if (innactiveTweetButton) {
        console.log('Innactive Tweet Button Found!')
        await innactiveTweetButton.click()
        //await page.waitForTimeout(1000)
      }
      const [tweetTextBox] = await page.$x("//div[contains(., 'happening?')]")
      if (tweetTextBox) {
        console.log('Tweet text box found')
        await tweetTextBox.click({ delay: 500 })
        const tweetText = await getTweetText()
        await tweetTextBox.type(tweetText, { delay: 20 })
        console.log('Tweet text entered')
      }
      await page.waitForTimeout(100)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(100)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(100)
      const [tweetButton] = await page.$x("//span[contains(., 'Tweet')]")
      if (tweetButton) {
        console.log('Send Tweet Button Found!')
        await tweetButton.click()
      }
      console.log('Tweet Sent!')
      resolve(true)
    } catch (err) {
      console.log('10 Caught Error: ' + err)
      resolve(false)
    }
  })
}
function getLogins (fileLocation) {
  const csv = fs.readFileSync(fileLocation)
  const array = csv.toString().split('\n')
  const result = []
  for (let i = 0; i < (array.length); i++) {
    const account = array[i].split(',')
    const obj = { username: account[0], email: account[1], password: account[2], proxy: account[3], useragent: account[12] }
    result.push(obj)
    if (i >= (array.length - 1)) {
      return new Promise((resolve, reject) => {
        resolve(result)
      })
    }
  }
}
function getRemoteBotData () {
  return new Promise((resolve, reject) => {
    const req = http.get('https://bot.nexislabs.org/public/botData.html', function (res) {
      let data = ''
      let json_data
      res.on('data', function (stream) {
        data += stream
      })
      res.on('end', function () {
        const decryptedData = decryptWithAES(data, myPassword)
        json_data = JSON.parse(decryptedData)
        // console.log(json_data);
        // console.log(decryptedData);
        // var array = json_data.toString().split("\n");
        // let result = [];
        // for (let i = 0; i < (array.length); i++) {
        //    var account = array[i].split(",");
        //    let obj = {username: account[0], email: account[1], password: account[2], proxy: account[3], useragent: account[12]}
        //     result.push(obj);
        //     if(i >= (array.length - 1)) {
        resolve(json_data)
        //     }
        // }
      })
    })
    req.on('error', function (e) {
      console.log(e.message)
    })
  })
}
function getRemoteLogins () {
  return new Promise((resolve, reject) => {
    const req = http.get('https://bot.nexislabs.org/public/exportedAccounts.html', function (res) {
      let data = ''
      let json_data
      res.on('data', function (stream) {
        data += stream
      })
      res.on('end', function () {
        const decryptedData = decryptWithAES(data, myPassword)
        json_data = JSON.parse(decryptedData)
        const array = json_data.toString().split('\n')
        const result = []
        for (let i = 0; i < (array.length); i++) {
          const account = array[i].split(',')
          const obj = { username: account[0], email: account[1], password: account[2], proxy: account[3], useragent: account[12] }
          result.push(obj)
          if (i >= (array.length - 1)) {
            resolve(result)
          }
        }
      })
    })
    req.on('error', function (e) {
      console.log(e.message)
    })
  })
}
const delay = (t, val) => new Promise(resolve => setTimeout(resolve, t, val))
async function autoScroll (page) {
  let totalScrolls = 30
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0
      const distance = 100
      var timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight
        window.scrollBy(0, distance)
        totalHeight += distance
        totalScrolls--
        if (totalHeight >= scrollHeight - window.innerHeight || totalScrolls == 0) {
          clearInterval(timer)
          resolve()
        }
      }, 2000)
    })
  })
}
async function getFollowerList () {
  const dbClient = new Client({
    connectionString: databaseUrl,
    application_name: '$ docs_quickstart_node'
  })

  await dbClient.connect()
  const statement = 'SELECT * FROM follower_list_data'
  const result = await dbClient.query(statement)
  await dbClient.end()
  return new Promise((resolve, reject) => {
    if (result.rowCount > 0) {
      console.log('Follower List Received - Count: ' + result.rowCount)
      // let randomFollowerId = result.rows[getRandomInt(result.rowCount)].id
      // let response = await client.v2.follow(userID.data.id, randomFollowerId);
      resolve(result.rows)
    } else {
      reject(false)
    }
  })
}
async function checkForCookiesButton (page) {
  const [cookiesButton] = await page.$x("//span[contains(., 'Accept all cookies')]")
  if (cookiesButton) {
    console.log('Cookies Button Found - Accepting Cookies')
    // botLog(botName, process.pid, 'Cookies Button Found - Accepting Cookies');
    await cookiesButton.click()
    return new Promise((resolve, reject) => {
      resolve(true)
    })
  } else {
    return new Promise((resolve, reject) => {
      resolve(false)
    })
  }
}
async function customWaitForText (page, text, seconds, customName) {
  for (let i = 0; i < (seconds / 10); i++) {
    await page.waitForTimeout(10000)
    // await page.screenshot({path: '/home/twitbot/twurlBot/logs/' + customName + 'Screenshot.jpg', fullPage: true})
    const html = await page.content()
    // fs.writeFileSync('/home/twitbot/twurlBot/logs/'+ customName +'Log.txt', html);
    const status = await searchString(html, text)
    if (status) {
      console.log(customName + ' screen loaded - Done waiting')
      // botLog(botName, process.pid, customName + ' screen loaded - Done waiting');
      return new Promise((resolve, reject) => {
        resolve(true)
      })
    } else {
      console.log('Still waiting for ' + customName + ' screen - Seconds waited so far: ' + (i * 10))
      await page.reload()
      // botLog(botName, process.pid, 'Still waiting for ' + customName + ' screen - Seconds waited so far: ' + (i * 10));
    }
    if (i == ((seconds / 10) - 1)) {
      return new Promise((resolve, reject) => {
        resolve(false)
      })
    }
  }
}
/* function getRandomImage(profile) {
    const profilePath = profilesPath + profile;
    const images = fs.readdirSync(profilePath + '/images');
    if(!images || images.length < 5) {
        console.log('Invalid images...exiting');
        return false;
        //process.exit(1);
    } else {
        return profilePath + '/images/' + images[getRandomInt(images.length)];
    }
} */
async function twitterProfileCheck (username) {
  console.log('Account Selected: ' + username)
  const browser = await puppeteer.launch({ headless: true, executablePath })
  const context = browser.defaultBrowserContext()
  context.overridePermissions('https://twitter.com', ['geolocation', 'notifications'])
  context.overridePermissions('https://www.twitter.com', ['geolocation', 'notifications'])
  const page = (await browser.pages())[0]
  await page.setDefaultNavigationTimeout(240000)

  await page.goto('https://twitter.com/' + username, { waitUntil: 'networkidle0' })
  const profilePageStatus1 = await customCheckForText(page, 'Following', 'profilePageStatus1')
  const profilePageStatus2 = await customCheckForText(page, 'Follower', 'profilePageStatus2')
  if (profilePageStatus1 == true && profilePageStatus2 == true) {
    console.log('Profile page loaded correctly - Starting profile check process')
  } else {
    console.log('Profile page is down or locked - Exiting')
    await browser.close()
    return new Promise((resolve, reject) => {
      resolve(false)
    })
  }

  const profilePageBannerStatus = await customCheckForText(page, 'header_photo', 'profilePageBannerStatus')
  const profilePageProfileStatus = await customCheckForText(page, 'default_profile_200x200.png', 'profilePageProfileStatus')

  if (profilePageBannerStatus == true && profilePageProfileStatus == false) {
    console.log('Banner & Profile Image Both Exist')
    await browser.close()
    return new Promise((resolve, reject) => {
      resolve(false)
    })
  } else {
    console.log('Banner & Profile Image Have Issues - Profile Update Needed')
    await browser.close()
    return new Promise((resolve, reject) => {
      resolve(true)
    })
  }
}
async function customCheckForText (page, text, customName) {
  await page.waitForTimeout(10000)
  await page.screenshot({ path: '/home/twitbot/twurlBot/logs/' + customName + 'Screenshot.jpg', fullPage: true })
  const html = await page.content()
  fs.writeFileSync('/home/twitbot/twurlBot/logs/' + customName + 'Log.txt', html)
  const status = await searchString(html, text)
  if (status) {
    console.log(customName + ' text found')
    return new Promise((resolve, reject) => {
      resolve(true)
    })
  } else {
    console.log('Text not found for ' + customName)
    return new Promise((resolve, reject) => {
      resolve(false)
    })
  }
}
