const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true, // 使用 SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

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
        }

        .tl {
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .gif-x {
            width: 60px;
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
            background: #384860;
        }

        .center {
            width: 80%;
            height: 200px;
            background: #1f2b3c;
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
            font-size: 24px;
            text-shadow: 4px 1px 3px grey;
        }

        .tip {
            font-size: 12px;
            color: #fff;
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
            <div class="gif" style="position: relative; right: -100px;">
                <img class="gif-x" src="cid:image2" />
            </div>
        </div>
        <div class="line"></div>
        <div class="center">
            <div class="codeF">
                <div class="codeT">
                    <span>用户你好，你的确认码为：</span>
                </div>
                <div class="code">
                    {{codeBlocks}}
                </div>
                <div class="tip">
                    如果影响到你，请前往系统取消系统邮箱提醒
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    `,
    invitation: `
    <div>
      <h1>{{title}}</h1>
      <p>您被邀请加入项目。点击以下链接接受邀请：</p>
      <p><a href="{{link}}">{{link}}</a></p>
    </div>
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

        for (const key in templateData) {
            htmlToSend = htmlToSend.replace(new RegExp(`{{${key}}}`, 'g'), templateData[key]);
        }

        const attachments = templateName === 'confirmation' ? [{
            filename: 'image.png',
            path: 'public/images/output.gif',
            cid: 'image1' // 这里的cid需要与img标签中的cid匹配
        }, {
            filename: 'image.png',
            path: 'public/images/out.gif',
            cid: 'image2' // 这里的cid需要与img标签中的cid匹配
        }] : [];

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
