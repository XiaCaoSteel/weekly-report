#!/bin/bash
set -e

#====================公众号配置区 后续填APPID/SECRET====================
export WX_APPID=""
export WX_APPSECRET=""
SCRIPT_ROOT="/root/.claude/projects/weekly-report"
COVER_DEFAULT="${SCRIPT_ROOT}/cover/default.jpg"
LOG_FILE="${SCRIPT_ROOT}/publish.log"
TMP_HTML="${SCRIPT_ROOT}/tmp_content.html"
#=====================================================================

echo "=====[$(date '+%Y-%m-%d %H:%M:%S')]开始周报生成&公众号草稿任务=====" >>${LOG_FILE}
cd ${SCRIPT_ROOT}

## 1、执行原生node生成周报
echo "执行：node src/index.js --format all" >>${LOG_FILE}
node src/index.js --format all

## 2、筛选最新doc(伪doc=html)
LATEST_DOC=$(ls -t reports/*.doc | head -n1)
if [ ! -f "${LATEST_DOC}" ];then
    echo "异常：未检索到周报doc文件" >>${LOG_FILE}
    exit 1
fi
echo "选定周报文件：${LATEST_DOC}" >>${LOG_FILE}

## 3、临时预处理正文
cp "${LATEST_DOC}" "${TMP_HTML}"

## 4、获取微信access_token
get_token(){
    curl -s "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_APPSECRET}" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4
}
ACCESS_TOKEN=$(get_token)
if [ -z "${ACCESS_TOKEN}" ];then
    echo "access_token获取失败，请核对AppID和AppSecret" >>${LOG_FILE}
    exit 1
fi

## 5、上传封面临时素材
upload_img(){
    local IMG_PATH=$1
    curl -s -F "media=@${IMG_PATH}" "https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${ACCESS_TOKEN}&type=image" | grep -o '"media_id":"[^"]*"' | cut -d'"' -f4
}
THUMB_MID=$(upload_img "${COVER_DEFAULT}")
echo "封面素材media_id:${THUMB_MID}" >>${LOG_FILE}

## 6、标题+正文赋值
TITLE_NAME=$(basename "${LATEST_DOC}" _weekly_report.doc)Github项目周报
ART_CONTENT=$(cat "${TMP_HTML}")

## 7、组装草稿JSON、创建公众号草稿
CREATE_JSON=$(jq -n \
--arg mid "${THUMB_MID}" \
--arg title "${TITLE_NAME}" \
--arg html "${ART_CONTENT}" \
'{
    articles:[{
        title:$title,
        thumb_media_id:$mid,
        digest:"本周Github项目进展汇总，详细内容见正文",
        content:$html,
        need_open_comment:0
    }]
}')

DRAFT_RESULT=$(curl -s --data "${CREATE_JSON}" "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${ACCESS_TOKEN}")
echo "草稿创建返回：${DRAFT_RESULT}" >>${LOG_FILE}

echo "=====[$(date '+%Y-%m-%d %H:%M:%S')]任务全部完成=====" >>${LOG_FILE}