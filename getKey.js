const CryptoJS = require('crypto-js')
const p = require('./package.json')

const getCryptoPass = (url) => {
  return CryptoJS.AES.encrypt(url, p.secretKey).toString()
}

console.log(getCryptoPass('https://xiajia.im'))

