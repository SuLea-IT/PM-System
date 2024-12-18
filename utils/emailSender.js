const nodemailer = require('nodemailer');
const fs = require("fs");
const path = require("path");

// 根据环境动态选择 .env 文件路径
const envPath = path.resolve(__dirname, '../.env'); // 本地环境的相对路径

require('dotenv').config({path: envPath});

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true, // 使用 SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

const imageToBase64 = (filePath) => {
    return fs.readFileSync(filePath, 'base64');
};

// 获取 Base64 编码的图片
const image3Base64 = imageToBase64(path.join(__dirname, '..', 'public', 'images', 'email_bg.png'));
// HTML 模板
const templates = {
    confirmation: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Slideshow</title>
    <style>
                #slideshow {
            max-width: 500px;
            margin: auto;
            background: #121a26;
            border-radius: 4px;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            padding: 10px;
            background-image: url(2017_bg.png);
            background-size: cover;
        }

        .tl {
            width: 40%;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .gif-x {
            width: 60px;
        }

        .gif {
            width: 30%;
        }

        .gif-r {
            width: 200px;
            position: relative;
            right: 60px;
        }

        .stand {
            background: #e968b8;
            border-radius: 4px;
            padding: 0 10px;
            font-size: 24px;

        }

        .title {
            font-size: 18px;
            color: #fff;
        }

        .line {
            width: 100%;
            height: 2px;
            /* background: #384860; */
            border-radius: 1px;
        }

        .center {
            width: 80%;
            height: 200px;
            background: rgba(31, 43, 60, 0.6);
            margin: 10px auto;
            border-radius: 10px;
            display: flex;
            justify-content: center;
        }

        .codeF {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-evenly;
            flex-direction: column;

        }

        .codeT {
            color: #fff;
        }

        .code {
            width: 80%;
            display: flex;
            align-items: center;
            justify-content: space-evenly;

        }

        .code div {
            background: #28374b;
            width: 40px;
            height: 60px;
            border-radius: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
            text-shadow: 4px 1px 3px grey;
        }

        .tip {
            font-size: 12px;
            color: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .date {
            display: flex;
            flex-direction: column;
            width: 30%;
            color: aliceblue;
            font-style: italic;
        }

        .date div {
            display: flex;
            justify-content: center;
        }

        .date div:nth-child(2) {
            font-size: 24px;
        }
    </style>
</head>
<body>
    <div id="slideshow">
        <div class="gif">
            <img class="gif-r" src="cid:image1" />
        </div>
        <div class="tl">
            <div class="title">
                <span>欢迎使用</span>
                <span class="stand">i8</span>
                <span>！</span>
            </div>
        </div>
        <div class="date">
<div>{{currentDate}}</div>
<div>{{currentTime}}</div>

        </div>
        <div class="line"></div>
        <div class="center">
            <div class="codeF">
                <div class="codeT">
                    <span>用户</span>
                    <span style="word-wrap: break-word; color: #e83e8c; font-size: 87.5%;"> {{username}} </span>
                    <span>你好，你的确认码为：</span>
                </div>
                <div class="code">
                    {{codeBlocks}}
                </div>
                <div class="tip">
                    <div style="padding: 10px 0;">
                        如果影响到你，请前往系统取消系统邮箱提醒
                    </div>
                    <div style="color: red;">
                        30分钟内有效
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    `,
    invitation: `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Slideshow</title>
    <style>
        #slideshow {
            max-width: 500px;
            margin: auto;
            background: #121a26;
            border-radius: 4px;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            padding: 10px;
            background-image: url(data:image/png;base64,${image3Base64});
            background-size: cover;
        }

        .tl {
            width: 40%;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .gif-x {
            width: 60px;
        }

        .gif {
            width: 30%;
        }

        .gif-r {
            width: 200px;
            position: relative;
            right: 60px;
        }

        .stand {
            background: #e968b8;
            border-radius: 4px;
            padding: 0 10px;
            font-size: 24px;
        }

        .title {
            font-size: 18px;
            color: #fff;
        }

        .link {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
        }

        .line {
            width: 100%;
            height: 2px;
            border-radius: 1px;
        }

        .center {
            width: 80%;
            height: 200px;
            background: rgba(31, 43, 60, 0.6);
            margin: 10px auto;
            border-radius: 10px;
            display: flex;
            justify-content: center;
        }

        .codeF {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-evenly;
            flex-direction: column;
        }

        .codeT {
            color: #fff;
            padding: 10px;
        }

        .code {
            width: 80%;
            display: flex;
            align-items: center;
            justify-content: space-evenly;
        }

        .code div {
            background: #28374b;
            width: 40px;
            height: 60px;
            border-radius: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
            text-shadow: 4px 1px 3px grey;
        }

        .link a {
            color: #0099ff;
            text-decoration: none;
            border-bottom: 1px dashed #0099ff;
            transition: color 0.5s ease-in-out, background-image 0.5s ease-in-out;
            font-size: 14px;
        }

        .link.hover a {
            color: #ff5733;
            background-image: linear-gradient(to right, #ff7600, #ea00ff);
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
        }

        .link a:hover {
            cursor: pointer;
        }
        .tip {
            font-size: 12px;
            color: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .date {
            display: flex;
            flex-direction: column;
            width: 30%;
            color: aliceblue;
            font-style: italic;
        }

        .date div {
            display: flex;
            justify-content: center;
        }

        .date div:nth-child(2) {
            font-size: 24px;
        }
    </style>
</head>

<body>
    <div id="slideshow">
        <div class="gif">
            <img class="gif-r" src="cid:image1" />
        </div>
        <div class="tl">
            <div class="title">
                <span>欢迎使用</span>
                <span class="stand">i8</span>
                <span>！</span>
            </div>
        </div>
        <div class="date">
<div>{{currentDate}}</div>
<div>{{currentTime}}</div>

        </div>
        <div class="line"></div>
        <div class="center">
            <div class="codeF">
                <div class="codeT">
                    <span>用户</span>
                    <span style="word-wrap: break-word; color: #e83e8c; font-size: 87.5%;"> {{username}} </span>
                    <span>你好，用户</span>
                    <span style="word-wrap: break-word; color: #e83e8c; font-size: 87.5%;">{{projectOwnerUsername}}</span>
                    <span>邀请你加入项目：</span>
                    <span style="word-wrap: break-word; color: #e83e8c; font-size: 87.5%;">{{projectName}}</span>
                    <span>链接为：</span>
                </div>
                <div class="link hover">
                                    <a href="{{inviteLink}}">{{topLink}}</a>
                                    <a href="{{inviteLink}}">{{tokenLink}}</a>
                </div>
                <div class="tip">
                    <div style="padding: 10px 0;">
                        如果影响到你，请前往系统取消系统邮箱提醒
                    </div>
                    <div style="color: red;">
                        30分钟内有效
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>

</html>
  `
};

const sendEmail = async (to, subject, templateName, templateData) => {
    try {
        // 获取模板并替换占位符
        let htmlToSend = templates[templateName];

        // 如果是confirmation模板，处理code
        if (templateName === 'confirmation' && templateData.code) {
            const code = templateData.code.split('');
            const codeBlocks = code.map(char => `<div>${char}</div>`).join('');
            htmlToSend = htmlToSend.replace('{{codeBlocks}}', codeBlocks);
        }

        // 获取当前时间
        const now = new Date();
        const month = now.getMonth() + 1; // 月份从0开始，所以加1
        const day = now.getDate();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // 格式化时间
        const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        const formattedDate = `${month}/${day}`;

        // 替换模板中的占位符
        htmlToSend = htmlToSend.replace('{{currentDate}}', formattedDate);
        htmlToSend = htmlToSend.replace('{{currentTime}}', formattedTime);

        for (const key in templateData) {
            htmlToSend = htmlToSend.replace(new RegExp(`{{${key}}}`, 'g'), templateData[key]);
        }
        let gif = path.resolve(__dirname, '../public/images/output.gif')

        const attachments = [{
            filename: 'output.gif',
            path: gif,
            cid: 'image1' // 这里的cid需要与img标签中的cid匹配
        }];

        let info = await transporter.sendMail({
            from: `"I8" <${process.env.EMAIL_USER}>`, // 发件人地址
            to: to, // 收件人地址列表
            subject: subject, // 邮件主题
            html: htmlToSend, // HTML 内容
            attachments: attachments
        });

        console.log('Message sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};


module.exports = {
    sendEmail
};
