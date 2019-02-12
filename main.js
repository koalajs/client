const { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog, globalShortcut, net } = require('electron')
const p = require('./package.json')
const path = require('path')
const Ips = require('ips')
const R = require('ramda')
const os = require('os')
const Store = require('electron-store')
const u = require('url')

const st = new Store()
let win, downWin

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
    title: 'E-Draw System',
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

// 创建下载进度窗体
const createDownloadBrowser = () => {
  downWin = new BrowserWindow({
    parent: win,
    modal: true,
    height: 250,
    width: 700,
    frame: false,
    resizable: false
  })
  downWin.loadURL(`file://${__dirname}/down.html`)
}

const isNotNil = (d) => R.not(R.isNil(d))
// 校验数据完整性
const isRightData = (d) => {
  return isNotNil(d.url) && isNotNil(d.protocol) && isNotNil(d.ip)
}

// 从服务端获取最新版本信息
const getNetVersionFromService = (data) => {
  return new Promise((resolve, reject) => {
    const url = `${data.protocol}//${data.url}${data.downloadPath}version.json`
    const request = net.request(url)
    request.on('response', (response) => {
      response.on('data', (body) => {
        resolve(body)
      })
    })
    // 如果线上没有部署下载包和版本校验文件。过滤掉弹出消息。
    request.on('error', err => {
      reject(err)
    })
    request.end()
  })
}

// 设置系统托盘图标菜单
const setTray = (d) => {
  const tray = new Tray(`${__dirname}/logo.png`)
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

// 显示下载进度界面
const showDownloadPage = (d) => {
  createDownloadBrowser()
}

// 显示site设置界面
const toSetUrl = (d) => {
  const url = `file://${__dirname}/index.html?v=${d.version}&clear=true&local_machine=${d.local_machine}&ip=${d.ip}`
  createBrowser(url)
}

// 显示新版本下载对话框
const showDownloadDialog = ({ v, d }) => {
  dialog.showMessageBox({
    type: 'info',
    title: '新版本',
    cancelId: 1,
    buttons: ['下载新版本', '跳过'],
    message: `有新版本可提供更新，版本号: v${v}`
  }, (res) => {
    (res === 0) && doShowDownloadProgram({ v, d })
  })
}

// buffer转换为JSON
const getJsonFromBuffer = (v) => {
  return JSON.parse(v.toString())
}

// 获取线上版本版本号
const getNetVersion = async (d) => {
  const v = await getNetVersionFromService(d)
  const versionData = getJsonFromBuffer(v)
  return versionData.version
}

// 检查是否有新版本需要下载(对比线上与本地版本号)
const isNeedDownloadNewVersion = ({ v, d }) => {
  return R.not(R.equals(v, d.version))
}

// 下载进度计算显示
const showDownloadProgramStatus = (item, event, totalBytes) => {
  const p = item.getReceivedBytes() / totalBytes
  win.setProgressBar(p)
  event.sender.send('newDownloadBytes', p)
}

// 下载状态跟踪处理
const onUpdateItem = (item, event, totalBytes) => {
  item.on('updated', () => showDownloadProgramStatus(item, event, totalBytes))
}

// 下载状态处理
const doDoneStatus = (state, filePath) => {
  if (state === 'completed') shell.openExternal(filePath)
  if (state === 'interrupted') dialog.showErrorBox('下载失败', '因网络或其他原因下载被中断! ')
  app.quit()
}

// 下载完成状态跟踪
const onDoneItem = (item, filePath) => {
  item.on('done', (e, state) => doDoneStatus(state, filePath))
}

// 下载流程处理
const showDownloadProgress = (event) => {
  downWin.webContents.session.on('will-download', (e, item) => {
    const totalBytes = item.getTotalBytes()
    const filePath = path.join(app.getPath('downloads'), item.getFilename())
    item.setSavePath(filePath)
    onUpdateItem(item, event, totalBytes)
    onDoneItem(item, filePath)
  })
}

// 下载子进程监听处理
const doShowDownloadProgram = ({ v, d }) => {
  showDownloadPage(d)
  ipcMain.once('downPageReady', (event, arg) => {
    showDownloadProgress(event)
    const downLink = `${data.protocol}//${data.url}/${data.downloadPath}setup-${v}.msi`
    downWin.webContents.downloadURL(downLink)
  })
}

// 检查版本和访问流程
const doCheckDownloadAndVisit = async (d) => {
  showEdrawSystem(d)
  const v = await getNetVersion(d)
  R.when(isNeedDownloadNewVersion, showDownloadDialog)({ v, d })
}

const main = R.ifElse(isRightData, doCheckDownloadAndVisit, toSetUrl)

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

// 系统主流程
app.on('ready', () => {
  main(data)
  setTray(data)
  setMenu()
  setKeys()
})
