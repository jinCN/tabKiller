var bkg = chrome.extension.getBackgroundPage()
let console = bkg.console
const sleep = ms => new Promise((resolve, reject) => setTimeout(resolve, ms))

const KILL_LEVEL=80
const KILL_TO=60
const SEAL_DISTANCE=100

let windowInfos = {}
let doKill=true

chrome.tabs.onActivated.addListener(scoreAndKill)

async function scoreAndKill(activeInfo) {
  console.log('triggered')
  let activeTabId = activeInfo.tabId
  // GC windowInfo
  chrome.windows.getAll({ windowTypes: ['normal']},Cb().ok)
  let windows=await Cb.pop()
  let keepIds={}
  for (let item of windows) {
    if(item.id){
      keepIds[item.id]=1
    }
  }
  for (let k of Object.keys(windowInfos)) {
    if(keepIds[k]){}else{
      delete windowInfos[k]
    }
  }
  
  chrome.tabs.query({ currentWindow: true }, Cb().ok)
  let tabs = await Cb.pop()
  if (tabs && tabs.length) {
  } else {
    return
  }
  let windowId = tabs[0].windowId
  windowInfos[windowId] = windowInfos[windowId] || {
    currentTabId: undefined,
    currentTime: undefined,
    tabTimeline: [],
    tabInfos:{}
  }
  let windowInfo = windowInfos[windowId]
  let tabInfos = windowInfo.tabInfos
  
  let keepTabIds = {}
  for (let item of tabs) {
    if (item.id) {
      keepTabIds[item.id] = 1
    }
  }
  for (let k of Object.keys(tabInfos)) {
    if (!keepTabIds[k]) {
      console.log(`deleting tabInfos[k]:`, tabInfos[k])
      delete tabInfos[k]
    }
  }
  
  for (let k of Object.keys(keepTabIds)) {
    tabInfos[k] = tabInfos[k] || { id: k, score: 0, sealedScore: 0 }
  }
  
  if(!windowInfo.currentTabId){
  
  }else{
    let inter = new Date()-windowInfo.currentTime
    let score = 0
    if(inter>2*60*1000){
      score = 10
    }else if(inter>60*1000){
      score = 7
    }else if(inter>30*1000){
      score = 5
    }else if(inter>10*1000){
      score = 3
    }else if(inter>3*1000){
      score = 1
    }
    if(score>0){
      windowInfo.tabTimeline.push({ id: windowInfo.currentTabId, score })
      windowInfo.tabTimeline= windowInfo.tabTimeline.filter(v=>keepTabIds[v.id])
      console.log(`windowInfos[windowId].tabTimeline.length:`, windowInfos[windowId].tabTimeline.length)
  
      let sum=windowInfo.tabTimeline.reduce((s,v)=>s+v.score,0)
      let acc=0
      let scoreMap={}
      if(sum>SEAL_DISTANCE){
        for (let item of Object.values(windowInfo.tabInfos)) {
          let newSealedScore=item.sealedScore*(SEAL_DISTANCE* SEAL_DISTANCE/sum/sum)
          item.sealedScore=newSealedScore
          scoreMap[item.id] = newSealedScore
        }
      }
      let sealPoint=-1
      for (let i = 0; i < windowInfo.tabTimeline.length; i++) {
        let { id, score } = windowInfo.tabTimeline[i]
        acc += score
        scoreMap[id] = scoreMap[id] || 0
        scoreMap[id] += score / (sum - acc) / (sum - acc)
        if (sum - acc > SEAL_DISTANCE) {
          sealPoint = i
          windowInfo.tabInfos[id].sealedScore = scoreMap[id]
        }
      }
      if(sealPoint!==-1){
        windowInfo.tabTimeline= windowInfo.tabTimeline.slice(sealPoint+1)
      }
      for (let [id,score] of Object.entries(scoreMap)) {
        windowInfo.tabInfos[id].score = score
      }
      console.log(`Object.values(windowInfo.tabInfos):`, Object.values(windowInfo.tabInfos))
    }
    let scoreSorted = Object.values(windowInfo.tabInfos).sort((a,b)=>a.score-b.score)
    console.log(`scoreSorted:`, scoreSorted)
    let length = Object.keys(keepTabIds).length
    if (length > KILL_LEVEL) {
      let toRemove = scoreSorted.slice(0, length - KILL_TO)
      console.log(`killing:`, toRemove)
      if(doKill){
        kill(toRemove.map(v=>v.id-0))
      }
    }
  }
  windowInfo.currentTabId = activeTabId
  windowInfo.currentTime = new Date()
  
  async function kill(toRemove) {
      if (toRemove.length > 0) {
        for (let i = 0; i < 3; i++) {
          await sleep(100)
          chrome.tabs.remove(toRemove, Cb().ok)
          await Cb.pop()
          if (chrome.runtime.lastError) {
            console.error(`chrome.runtime.lastError:`, chrome.runtime.lastError)
          } else {
            break
          }
        }
      }
  }
}

function Cb () {
  let cb = makeCb()
  Cb.cbStack.push(cb)
  refCb(cb)
  return Cb
}

let dummyFunc = () => { throw new Error('Cb visit error! Please construct one before visit') }
let dummy = {
  ok: dummyFunc,
  err: dummyFunc,
  arr: dummyFunc,
  pair: dummyFunc
}

function refCb (cb = dummy) {
  let funcs = ['ok', 'err', 'arr', 'pair']
  funcs.forEach(v => { Cb[v] = cb[v] })
}

Cb.cbStack = []
Cb.pop = function () {
  if (Cb.cbStack.length === 0) {
    throw new Error('Cb pop error! Please construct one before pop')
  }
  let cb = Cb.cbStack.pop()
  refCb(Cb.cbStack[Cb.cbStack.length - 1])
  return cb
}
Cb.new = function () {
  return makeCb()
}

function makeCb () {
  let ok, err
  let cb = new Promise((resolve, reject) => {
    ok = resolve
    err = reject
  })
  Object.assign(cb, {
    ok,
    err,
    arr: (...args) => ok(args),
    pair: (e, v) => e != null ? err(e) : ok(v)
  })
  return cb
}
