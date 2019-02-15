const { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog, globalShortcut, net } = require('electron')
const p = require('./package.json')
const path = require('path')
const Ips = require('ips')
const R = require('ramda')
const os = require('os')
const Store = require('electron-store')
const u = require('url')
const { autoUpdater } = require('electron-updater')

const st = new Store()
let win, tray

// 组织全局使用的数据
const data = {
  protocol: st.get('protocol'),
  url: st.get('clientUrl'),
  downloadPath: '/statics/download/',
  ip: Ips().local,
  local_machine: os.hostname(),
  version: p.version
}

// 创建浏览窗体
const createBrowser = (url) => {
  win = new BrowserWindow({
    title: 'Koalajs System',
    minHeight: 570,
    minWidth: 1000,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, './logo.png'),
    autoHideMenuBar: true,
    maximizable: true,
    useContentSize: true,
    show: false
  })
  win.maximize()
  win.loadURL(url)
}

// 监视关闭处理
const watchClose = () => {
  win.on('close', (event) => {
    dialog.showMessageBox({
      type: 'info',
      title: '关闭',
      cancelId: 1,
      buttons: ['确定', '取消'],
      message: `确定要关闭程序么？ 当前未保存操作将会丢失！`
    }, (res) => {
      if (res === 0) {
        win.destroy()
        app.quit()
      }
    })
    event.preventDefault()
  })
}

const isNotNil = (d) => R.not(R.isNil(d))
// 校验数据完整性
const isRightData = (d) => {
  return isNotNil(d.url) && isNotNil(d.protocol) && isNotNil(d.ip)
}

// 从服务端获取最新版本信息
// 设置系统托盘图标菜单
const setTray = (d) => {
  tray = new Tray(`${__dirname}/logo.png`)
  tray.setToolTip(`Wynn E-Draw System`)
  const template = [
    { label: '全屏显示', click: () => win.setFullScreen(!win.isFullScreen()) },
    { label: '初始化设定', click: () => clearAndRestart() },
    { label: '开发工具', click: () => win.webContents.openDevTools() },
    { label: `版本: ${d.version}` },
    { label: '退出', click: () => app.quit() }
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

// 设置窗体菜单
const setMenu = () => {
  const template = [{
    label: 'Menu',
    submenu: [
      { role: 'reload' },
      { role: 'forcereload' },
      { role: 'toggledevtools' },
      { role: 'togglefullscreen' },
      { role: 'quit' }
    ]
  }]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// 设置全局快捷键
const setKeys = () => {
  globalShortcut.register('Ctrl+q', () => {
    win.isFullScreen() && win.setFullScreen(false)
  })
}

// 显示Edraw系统界面
const showEdrawSystem = (d) => {
  const url = `${d.protocol}//${d.url}/#/?v=${d.version}&clear=true&local_machine=${d.local_machine}&ip=${d.ip}&app_version=${d.version}`
  createBrowser(url)
}

// 显示site设置界面
const toSetUrl = (d) => {
  const url = `file://${__dirname}/index.html?v=${d.version}&clear=true&local_machine=${d.local_machine}&ip=${d.ip}`
  createBrowser(url)
}

const main = R.ifElse(isRightData, showEdrawSystem, toSetUrl)

// 重启程序
const restartApplication = () => {
  app.relaunch()
  app.exit()
}

// 设定Storage
const setST = (url) => {
  st.set('clientUrl', url.host)
  st.set('protocol', url.protocol)
}

// 清理storage
const clearST = () => {
  st.delete('clientUrl')
  st.delete('protocol')
}

// 清除st并重启app
const clearAndRestart = () => {
  clearST()
  restartApplication()
}

// 设定storage，重启程序
ipcMain.on('configURL', (event, arg) => {
  const url = new u.URL(arg.trim())
  setST(url)
  restartApplication()
})

// 发送消息
const sendStatusToWindow = (text) => {
  if (R.isNil(win)) return
  win.setTitle(text)
}

autoUpdater.on('checking-for-update', () => {
  sendStatusToWindow('检查是否有新版本')
})

autoUpdater.on('update-available', (info) => {
  sendStatusToWindow('有新版本可更新')
})

autoUpdater.on('update-not-available', (info) => {
  sendStatusToWindow('无需更新')
})

autoUpdater.on('error', (err) => {
  sendStatusToWindow('自动更新出错. ' + err)
})

autoUpdater.on('download-progress', (progressObj) => {
  sendStatusToWindow(`下载速度: ${Math.floor(progressObj.bytesPerSecond / 1024)} kb/s 已下载: ${Math.floor(progressObj.percent)}% `)
})

autoUpdater.on('update-downloaded', (info) => {
  sendStatusToWindow('新版本已下载完成')
  dialog.showMessageBox({
    type: 'info',
    title: '新版本',
    cancelId: 1,
    buttons: ['现在更新', '稍后'],
    message: `有新版本可提供更新`
  }, (res) => {
    (res === 0) && doUpdateApp()
  })
})

const doUpdateApp = () => {
  autoUpdater.quitAndInstall(true, true)
}

// 系统主流程
app.on('ready', () => {
  main(data)
  setTray(data)
  setMenu()
  setKeys()
  watchClose()
  autoUpdater.checkForUpdatesAndNotify()
})

app.on('window-all-closed', () => {
  app.quit()
})
