API=http://localhost:3000/api/v1
J='content-type: application/json'
login() { curl -s $API/auth/login -H "$J" -d "{\"email\":\"$1\",\"password\":\"Password123\"}" | jq -r .data.tokens.accessToken; }

echo "1) Đăng ký Bình và theo dõi khu vực Hoàn Kiếm"
BINH=$(curl -s $API/auth/register -H "$J" \
  -d "{\"email\":\"binh$(date +%s)@test.local\",\"password\":\"Password123\",\"displayName\":\"Trần Bình\"}" \
  | jq -r .data.tokens.accessToken)
curl -s $API/users/me/saved-areas -H "authorization: Bearer $BINH" -H "$J" \
  -d '{"name":"Hồ Gươm","latitude":21.0287,"longitude":105.8524,"radiusMeters":2000}' | jq -c '.data | {id,name}'
# Đăng ký thiết bị giả để xem log push của provider mock
curl -s -o /dev/null -w "   device: %{http_code}\n" $API/notifications/devices -H "authorization: Bearer $BINH" -H "$J" \
  -d '{"token":"demo-fcm-token-binh-123","platform":"ANDROID"}'

echo "2) An báo sự cố ngập"
AN=$(login user@urbanalert.local)
INC=$(curl -s $API/incidents -H "authorization: Bearer $AN" -H "$J" \
  -d '{"type":"FLOODING","title":"Ngập sâu phố Hàng Bài","description":"Nước ngập 30cm","latitude":21.0245,"longitude":105.8530}' \
  | jq -r .data.id)
echo "   incidentId=$INC"
echo "   Khách xem chi tiết (PENDING thì bị ẩn → mong đợi 404):"
curl -s -o /dev/null -w "   %{http_code}\n" $API/incidents/$INC

echo "3) Moderator tìm báo cáo trong hàng chờ và duyệt"
sleep 3   # đợi moderation-service nhận incident.created từ Kafka
MOD=$(login moderator@urbanalert.local)
CASE=$(curl -s "$API/moderation/reports?limit=100" -H "authorization: Bearer $MOD" \
  | jq -r ".data[] | select(.incidentId==\"$INC\") | .id")
echo "   caseId=$CASE"
curl -s -X POST $API/moderation/reports/$CASE/approve -H "authorization: Bearer $MOD" -H "$J" \
  -d '{"note":"Đã xác minh qua camera"}' | jq -c '.data | {status, actions: [.actions[].action]}'

echo "4) Kiểm tra kết quả"
sleep 3   # đợi notification-service xử lý incident.verified
echo "   Sự cố hiện công khai trên bản đồ gần đó:"
curl -s "$API/incidents/nearby?latitude=21.0285&longitude=105.8542&radiusMeters=1000" \
  | jq -c ".data[] | select(.id==\"$INC\") | {status, distanceMeters}"
echo "   Thông báo của An:";  curl -s $API/notifications -H "authorization: Bearer $AN"   | jq -c '.data[0] | {type,title,body}'
echo "   Thông báo của Bình:"; curl -s $API/notifications -H "authorization: Bearer $BINH" | jq -c '.data[] | {type,title,body}'
echo "   Lịch sử sự cố:"
curl -s $API/incidents/$INC/history -H "authorization: Bearer $AN" | jq -c '.data[] | {action, previousStatus, newStatus}'
