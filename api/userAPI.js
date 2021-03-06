const express = require('express')
const bcrypt = require('bcrypt')
const api = express()
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const UserModel = require('../model/user')
const CommentModel = require('../model/comment')
const PostModel = require('../model/post')
const { sendRegisterEmail, sendForgotPassEmail, sendPassSetEmail } = require('../functions/emailFunctions')
const authenticateToken = require('./auth')

api.get('/user', authenticateToken, async (req, res) => {
    try {
        const user = await UserModel.findById(req.currUser.userId)
        if (!user) {
            res.status(404).send('User not found')
        }

        return res.status(200).send(user)
    } catch (err) {
        return res.status(500).send(err.message)
    }
})

api.post('/user/register', async (req, res) => {
    try {
        const tempPassword = createRandomPassword()
        const hashedPassword = await bcrypt.hash(tempPassword, 10)

        let infoNotEmpty = req.body.name && req.body.email && req.body.name.replace(/\s/g, '').length && req.body.email.replace(/\s/g, '').length

        if (infoNotEmpty) {
            if (await UserModel.findOne({ email: req.body.email })) {
                return res.status(400).send('The email or name has been used')
            } else if (await UserModel.findOne({ name: req.body.name })) {
                return res.status(400).send('The email or name has been used')
            }
        } else {
            return res.status(400).send('Name or email should not be empty')
        }

        let user = {
            name: req.body.name,
            email: req.body.email,
            password: hashedPassword
        }

        const data = await UserModel.create(user)

        const err = sendRegisterEmail(req.body.name, req.body.email, tempPassword)
        if (err) return res.status(500).send('系統內部錯誤，無法註冊。')

        return res.status(201).send(data)
    } catch (err) {
        return res.status(500).send(err.message)
    }
})

api.post('/user/login', async (req, res) => {
    try {
        const user = await UserModel.findOne({ email: req.body.email })

        if (await bcrypt.compare(req.body.password, user.password)) {
            const data = { userId: user._id }
            const accessToken = jwt.sign(data, process.env.ACCESS_TOKEN_SECRET)
            return res.json({ accessToken: accessToken })
        } else {
            return res.status(401).send('Login Fail')
        }
    } catch (err) {
        return res.status(500).send(err.message)
    }
})

api.put('/user', authenticateToken, async (req, res) => {
    try {
        let settingPassword = false
        if (req.body.password) {
            if (req.body.password.replace(/\s/g, '').length) {
                req.body.password = await bcrypt.hash(req.body.password, 10)
                settingPassword = true
            } else {
                return res.status(400).send('Password should not be empty')
            }
        }

        if (req.body.name) {
            if (!req.body.name.replace(/\s/g, '').length) {
                return res.status(400).send('暱稱不能為空白')
            }
            else if (await UserModel.findOne({ name: req.body.name })) {
                return res.status(400).send('無法使用此暱稱')
            }
        }

        const user = await UserModel.findByIdAndUpdate(req.currUser.userId, req.body)
        if (!user) {
            return res.status(404).send('User not found')
        }

        if (req.body.name) {
            await PostModel.updateMany({ authorId: req.currUser.userId }, { authorName: req.body.name })
            await CommentModel.updateMany({ authorId: req.currUser.userId }, { authorName: req.body.name })
        }

        if (settingPassword) sendPassSetEmail(user.name, user.email)

        const data = await UserModel.findById(req.currUser.userId)
        return res.status(200).send(data)
    } catch (err) {
        return res.status(500).send(err.message)
    }
})

api.put('/user/forgot/:email', async (req, res) => {
    try {
        const user = await UserModel.findOne({ email: req.params.email })
        if (!user) return res.sendStatus(404)

        const tempPassword = createRandomPassword()
        const hashedPassword = await bcrypt.hash(tempPassword, 10)

        const data = await UserModel.findByIdAndUpdate(user._id, { password: hashedPassword })

        const err = sendForgotPassEmail(user.name, user.email, tempPassword)
        if (err) return res.sendStatus(500)

        return res.status(200).send(data)
    } catch (err) {
        return res.status(500).send(err.message)
    }
})

const createRandomPassword = () => {
    let tempPassword
    do {
        tempPassword = crypto.randomBytes(6).toString('base64')
    } while (tempPassword.includes('I') || tempPassword.includes('l') || tempPassword.includes('o') || tempPassword.includes('0'))

    return tempPassword
}

module.exports = api
