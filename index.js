const { TikTokLiveConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
// تحديث السطر لفتح الأمان وتفعيل استقبال أوامر الأزرار
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});


const TARGET_USERNAME = "ar_gamer_ar"; // اسم الحساب
let isJoinOpen = false; // حالة استقبال المنضمين
const joinedUsers = new Set(); // لتفادي تكرار نفس الشخص

// تقديم ملفات الواجهة
app.use(express.static(path.join(__dirname, 'public')));

let tiktokConnection = new TikTokLiveConnection(TARGET_USERNAME, {
    requestOptions: { timeout: 10000 },
    websocketOptions: { timeout: 10000 }
});

// استقبال الأوامر من صفحة الويب (صاحب البث)
io.on('connection', (socket) => {
    // إرسال الحالة الحالية واللاعبين عند فتح الصفحة
    socket.emit('syncState', { isJoinOpen, users: Array.from(joinedUsers) });

    // أمر تغيير حالة الانضمام
    socket.on('toggleJoin', (status) => {
        isJoinOpen = status;
        if (!isJoinOpen) processedMessages.clear(); // تنظيف المؤقت
        io.emit('joinStatusChanged', isJoinOpen);
        console.log(`[System]: الانضمام الآن: ${isJoinOpen ? 'مفتوح' : 'مغلق'}`);
    });

    // إدارة الأسماء يدوياً من لوحة التحكم
    socket.on('adminAddUser', (name) => {
        if (name && !joinedUsers.has(name)) {
            joinedUsers.add(name);
            io.emit('updateUsers', Array.from(joinedUsers));
        }
    });

    socket.on('adminRemoveUser', (name) => {
        joinedUsers.delete(name);
        io.emit('updateUsers', Array.from(joinedUsers));
    });

    socket.on('adminClearAll', () => {
        joinedUsers.clear();
        io.emit('updateUsers', Array.from(joinedUsers));
    });
});

const processedMessages = new Set();

// الاستماع لتعليقات تيك توك
tiktokConnection.on('chat', (data) => {
    if (!isJoinOpen) return; // تجاهل التعليقات إذا كان التسجيل مغلقاً

    if (data) {
        const msgId = data.msgId || (data.msg && data.msg.id);
        if (msgId && processedMessages.has(msgId)) return;
        if (msgId) processedMessages.add(msgId);

        const nickname = data.nickname || (data.user && data.user.nickname) || 'unknown';
        const comment = (data.comment || data.text || data.content || '').trim();

        // فحص إذا كتب الكلمة المفتاحية "انضم" ولم يسجل مسبقاً
        if (comment === 'انضم' || comment.toLowerCase() === 'انضم') {
            if (!joinedUsers.has(nickname)) {
                joinedUsers.add(nickname);
                console.log(`➕ لاعب جديد انضم: ${nickname}`);
                // إرسال الاسم فوراً للواجهة رسومياً
                io.emit('updateUsers', Array.from(joinedUsers));
            }
        }
    }
});

// تشغيل الفحص والاتصال التلقائي
async function runServer() {
    try {
        await tiktokConnection.waitUntilLive(30);
        await tiktokConnection.connect();
        console.log('✅ متصل بنجاح ببث تيك توك!');
    } catch (e) {
        setTimeout(runServer, 30000);
    }
}

// تشغيل خادم الويب على المنفذ 3000
server.listen(3000, () => {
    console.log('🚀 موقع عجلة الحظ جاهز ومتاح على الرابط: http://localhost:3000');
    runServer();
});
