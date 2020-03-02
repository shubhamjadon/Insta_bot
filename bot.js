const puppeteer = require('puppeteer');
const rp = require('request-promise');
const request = require('request');
const cheerio = require('cheerio');
const fs = require('fs');
const iPad = puppeteer.devices['iPhone 6 Plus landscape'];

(async () => {
	try {
		// Intializing
		const userData = fs.readFileSync('data/user.json');
		const { insta_username, insta_password, doPost, totalPosts, doComment, doLike, totalLikes } = JSON.parse(userData);
		const browser = await puppeteer.launch({
			headless: false
			// executablePath: "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
		});
		const page = await browser.newPage();
		await page.emulate(iPad);
		await page.setViewport({
			width: 1050,
			height: 600
		});

		await loadSession();
		await logIn();
		if (doPost) await post();
		if (doLike) await likeAndComment();
		// await logout();

		// Read cookies and set them
		const cookies = await page.cookies();
		fs.writeFileSync('data/cookies.json', JSON.stringify(cookies));

		await browser.close();


		// Helper functions
		async function loadSession() {
			const previousSession = fs.existsSync('data/cookies.json');
			if (previousSession) {
				const content = fs.readFileSync('data/cookies.json');
				const cookiesArr = JSON.parse(content);
				if (cookiesArr.length !== 0) {
					for (let cookie of cookiesArr) {
						await page.setCookie(cookie);
					}
					console.log('info : session loaded in the browser');
				}
			};
		}

		async function logIn() {
			for (let count = 0; count < 3; count++) {
				try {
					await page.goto('https://instagram.com/accounts/login', { waitUntil: 'networkidle0' });
					break;
				} catch (err) {
					console.log("error: can't connect to instagram login page");
				}
			}
			// Try to login if the session is expired!!
			try {
				const username = await page.$('[name="username"]');
				await username.type(`${insta_username}`, { delay: 100 });
				const password = await page.$('[name="password"]');
				await password.type(`${insta_password}`, { delay: 100 });
				await page.evaluate(() => document.querySelector('[type="submit"]').click());
				await page.waitForNavigation({ waitUntil: 'networkidle0' });
			} catch (err) {
				console.log("info : user already logged in");
			}
		}

		async function post() {
			// post photos
			for (let i = 0; i < totalPosts; i++) {
				// fetch photo from array
				let status = fs.readFileSync('data/photos.json');
				let { num, doc, photos } = JSON.parse(status);

				// download respective photo of the photo array
				console.log('info : downloading photo')
				await download(photos[num]);

				// Post that photo
				let tags = photos[num]
					.replace('_1280x720.jpg', '')
					.split('/')[4]
					.split('_')
					.filter(el => !Number(el))
					.map(el => '#' + el)
					.join('');

				// await removeModal();

				await page.waitForSelector('.q02Nz._0TPg');
				const [fileChooser] = await Promise.all([
					page.waitForFileChooser(),
					page.click('.q02Nz._0TPg'),
				]);
				await page.waitFor(3000);
				await fileChooser.accept(['data\\post.jpg']);

				const nextBtn = await page.waitForSelector('.UP43G');
				await page.waitFor(2000);
				await nextBtn.click();
				const desc = await page.waitForSelector('._472V_');
				await page.waitFor(2000);
				await desc.type(`${tags}`, { delay: 150 });
				await page.waitFor(2000);
				await page.evaluate(() => document.querySelector('.UP43G').click());

				console.log('info : photo posted');
				// If no photo left then fetch new photos
				num++;
				if (num == 15) {
					console.log('info : last link reached');
					num = 0;
					doc++;
					photos = await fetchPhotos(doc);
				}
				fs.writeFileSync('data/photos.json', JSON.stringify({ num, doc, photos }));
			}
			// functions to help in posting photo
			async function fetchPhotos(doc, category = 'animals') {
				let arr = [];
				let options = {
					url: `https://wallpaperscraft.com/catalog/${category}/${doc}`,
					gzip: true,
					transform: function (body) {
						return cheerio.load(body);
					}
				}
				let $ = await rp(options);
				let imgLinks = $('.wallpapers__canvas .wallpapers__image');
				for (let i = 0; i < 15; i++) {
					let url = imgLinks[i].attribs.src.replace('300x168', '1280x720');
					arr.push(url);
				}
				console.log('info : new links fetched');
				return arr;
			}
			function download(url) {
				return new Promise((res, rej) => {
					request(url).pipe(fs.createWriteStream('data/post.jpg')).on('close', () => {
						console.log('info : photo downloaded');
						res('ok');
					});
				})
			}
		}

		async function likeAndComment() {
			// Read tags from the file
			let tags = fs.readFileSync('data/tags.txt');
			tags = tags.toString().split('\r\n');

			for (let tag of tags) {
				// Try to open the tag page
				let count = 0;
				for (count = 0; count < 3; count++) {
					try {
						await page.goto(`https://www.instagram.com/explore/tags/${tag}/`);
						break;
					} catch (err) {
						console.log(`error: can't open the #${tag} page, try ${count + 1}`);
					}
				}
				if (count == 3) continue;
				
				//  Find photos and like them
				await page.waitForSelector('.v1Nh3');
				page.waitFor(3000);
				const photos = await page.$$('.v1Nh3');
				await photos[9].click(); // start from the newest photos not the popular ones

				for (let i = 9; i < totalLikes + 9; i++) {
					// Try to open modal for giving like to the photo
					try {
						await page.waitFor(3000);
						const likeBtn = await page.waitForSelector('.dCJp8');
						await likeBtn.click();
						if (doComment) {
							const commentBox = await page.waitForSelector('.Ypffh');
							const comment = await getComment();
							await commentBox.type(`${comment}\r`, { delay: 100 });
						}
						await page.waitFor(3000);
						await page.evaluate(() => document.querySelector('.coreSpriteRightPaginationArrow').click());
					} catch (err) {
						await page.evaluate(() => document.querySelector('.coreSpriteRightPaginationArrow').click());
						console.log(`error: can't like or comment the photo no: ${i + 1} in #${tag}`);
					}
				}
			}
		}

		async function logOut() {
			await page.goto(`https://instagram.com/${insta_username}`, { waitUntil: "networkidle0" });
			await page.click('.Q46SR');
			const logBtn = await page.waitForSelector('._34G9B.H0ovd');
			await logBtn.click();
			const logout = await page.waitForSelector('.piCib button:nth-of-type(1)');
			await logout.click();
		}

		async function search() {
			// Search for a tag
			const search = await page.$('[placeholder = "Search"]');
			await search.type('#fruits', { delay: 100 })
			await page.waitForSelector('.yCE8d')
			const links = await page.evaluate(() => Array.from(document.querySelectorAll('.yCE8d'), el => el.href));
		}

		async function removeModal() {
			try {
				await page.waitForSelector('.piCib button:nth-of-type(2)');
				await page.evaluate(() => document.querySelector('.piCib button:nth-of-type(2)').click());
			} catch (err) {
				console.log('error: no modal found on the page');
			}
		}

		async function getComment() {
			let comments = fs.readFileSync('data/comments.txt');
			comments = comments.toString().split("\r\n");
			let num = Math.floor(Math.random() * comments.length);
			return comments[num];
		}
		
	} catch (err) {
		console.log(err);
	}
})();