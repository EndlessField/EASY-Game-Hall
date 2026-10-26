#include <iostream>
#include <cstdio>
#include <string>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <ctime>
#include <windows.h>
#include <conio.h>
#include <bitset>
using namespace std;
#define KEY_DOWN(VK_NONAME) ((GetAsyncKeyState(VK_NONAME) & 0x8000) ? 1:0)
#define KEY_DOWM(vk_c) (GetAsyncKeyState(vk_c)&0x8000?1:0)
void color(int a){
    SetConsoleTextAttribute(GetStdHandle(STD_OUTPUT_HANDLE),a);
}
void HideCursor(){
    CONSOLE_CURSOR_INFO cursor_info = {1, 0}; 
    SetConsoleCursorInfo(GetStdHandle(STD_OUTPUT_HANDLE), &cursor_info);
}
void block(int x,int y){
    HANDLE   hCon;
    hCon = GetStdHandle(STD_OUTPUT_HANDLE);  
    COORD   setps;
    setps.X = x;
    setps.Y = y;
    SetConsoleCursorPosition(hCon,setps);  
}
bitset<128>pre;
bitset<128>down;
void pan(char c){
    bool hahbhchdhehfhg;
    if(c == 'w'){
        if(!KEY_DOWN(VK_UP))hahbhchdhehfhg=0;
        else hahbhchdhehfhg=1;
    }else if(c == 's'){
        if(!KEY_DOWN(VK_DOWN))hahbhchdhehfhg=0;
        else hahbhchdhehfhg=1;
    }else if(c == 'a'){
        if(!KEY_DOWN(VK_LEFT))hahbhchdhehfhg=0;
        else hahbhchdhehfhg=1;
    }else if(c == 'd'){
        if(!KEY_DOWN(VK_RIGHT))hahbhchdhehfhg=0;
        else hahbhchdhehfhg=1;
    }else if(c == '1'){
        if(!KEY_DOWN(VK_NUMPAD1) && !KEY_DOWN('1'))hahbhchdhehfhg=0;
        else hahbhchdhehfhg=1;
    }else if(c == '2'){
        if(!KEY_DOWN(VK_NUMPAD2) && !KEY_DOWN('2'))hahbhchdhehfhg=0;
        else hahbhchdhehfhg=1;
    }else if(c == '3'){
        if(!KEY_DOWN(VK_NUMPAD3) && !KEY_DOWN('3'))hahbhchdhehfhg=0;
        else hahbhchdhehfhg=1;
    }else{
        if(!KEY_DOWN(c))hahbhchdhehfhg=0;
        else hahbhchdhehfhg=1;
    }
    if(hahbhchdhehfhg)down[c]=1;
    else down[c]=0;
}
bool check(char c){
    if(down[c] != pre[c]){
        pre[c] = down[c];
        if(down[c]){
            return true;
        }
    }
    return false;
}
int heng[31] = {0, 1, 4};
int shu[31][101] = {{0},
{0, 1, 2, 3, 4},
{0, 1},
{0, 1}
};
string hengs[31] = {"0", "营火", "小村庄", "科学", "成就", "工坊", "贸易", "独角兽"};
string shus[31][101] = {{"0"}, 
{"0", "采集猫薄荷", "猫薄荷田", "锻造木头", "小屋", "图书馆", "粮仓", "矿井", "工坊"},
{"0", "伐木工", "农民", "学者", "猎人", "矿工"},
{"0", "日期", "农业", "箭业", "采矿", "畜牧业", "金属加工", "行政部门", "数学", "建筑业"}
}; 
int shus1[101] = {0, 1, 2, 3, 4, 5, 6, 7, 8};
int shus2[101] = {0, 1, 2, 3, 4, 5};
bool z1[1010];
int hengl = 2, shul[31] = {0, 4, 0, 1};
int x = 1;
int y = 1;
int zz11 = 1;
double zz12[101][5] = {{0}, {0, 0}, {0, 10}, {0, 100}, {0, 5}, {0, 25}, {0, 70}, {0, 100}, {0, 100, 400}};
int zz13[101] = {0, 0, 1, 1, 2, 2, 2, 2, 302};
string zz14[31] = {"0", "猫薄荷", "木头", "矿物"};
int zz15[101] = {0};
int zz16[101][5] = {{0}, {0, 0}, {0, 10}, {0, 100}, {0, 5}, {0, 25}, {0, 70}, {0, 100}, {0, 100, 400}};
double zz17[101]  = {0, 0, 1.12, 0, 2.5, 1.15, 1.25, 1.15, 1.15};
bool zz31[101];
int zz32[101] = {0, 30, 100, 300, 500, 500, 900};
int zz33 = 1;
int zz21[10];
int zz22 = 0;
int zz23 = 1;
double bohe1 = 0;
double mutou1 = 0;
double keji1 = 0;
double catli1 = 0;
double kuangwu1 = 0;
int cat1 = 0;
int cat2 = 0;
int bohe2 = 5000;
int mutou2 = 200;
int keji2 = 500;
int catli2 = 150;
int kuangwu2 = 250;
bool maopi1 = false;
double maopi = 0.0;
bool xiangya1 = false;
double xiangya = 0.0;
bool xinqing1 = false;
int xinqing = 100;
int tim0 = 0, tim1 = 1, tim2 = 1, tim3 = 0;
int timm1 = 0, timm2 = 0; 
string tim[5] = {"0", "春季", "夏季", "秋季", "冬季"};
bool h1 = true;

bool pai1(int x1, int y1){
    return shus1[x1] < shus1[y1];
}

bool pai2(int x1, int y1){
    return shus2[x1] < shus2[y1];
}

void output(double x){
    if(x >= 1000000){
        x /= 1000000;
        if((int)x != x){
            if((int)(x * 10) / 10.0 != x){
                printf("%.2fM", x);
            }else{
                printf("%.1fM", x);
            }
        }else{
            cout << x << "M"; 
        }
    }else if(x >= 10000){
        x /= 1000;
        if((int)x != x){
            if((int)(x * 10) / 10.0 != x){
                printf("%.2fK", x);
            }else{
                printf("%.1fK", x);
            }
        }else{
            cout << x << "K"; 
        }
    }else{
        if((int)x != x){
            if((int)(x * 10) / 10.0 != x){
                printf("%.2f", x);
            }else{
                printf("%.1f", x);
            }
        }else{
            cout << x; 
        }
    }
}

void output00(){
    int m1 = 3;
    if(xinqing1){
        color(13);
        block(1, m1);
        cout << "                    ";
        block(1, m1);
        cout << "幸福度：" << xinqing << "%";
        m1++;
    }
    color(15);
    block(1, m1);
    cout << "                    ";
    block(1, m1);
    cout << "猫薄荷：" ;
    if(bohe1 > bohe2){
        bohe1 = bohe2;
    }
    if(bohe1 >= bohe2 * 0.9){
        color(14);
    }
    output(bohe1);
    color(7);
    cout << "/";
    output(bohe2);
    m1++;
    color(15);
    block(1, m1);
    cout << "                    ";
    block(1, m1);
    cout << "木头：";
    if(mutou1 > mutou2){
        mutou1 = mutou2;
    }
    if(mutou1 >= mutou2 * 0.9){
        color(14);
    }
    output(mutou1);
    color(7);
    cout << "/";
    output(mutou2);
    m1++;
    if(zz31[4]){
        color(15);
        block(1, m1);
        cout << "                    ";
        block(1, m1);
        cout << "矿物：";
        if(kuangwu1 > kuangwu2){
            kuangwu1 = kuangwu2;
        }
        if(kuangwu1 >= kuangwu2 * 0.9){
            color(14);
        }
        output(kuangwu1);
        color(7);
        cout << "/";
        output(kuangwu2);
        m1++;
    }
    if(zz31[3]){
        color(15);
        block(1, m1);
        cout << "                    ";
        block(1, m1);
        color(12);
        cout << "猫力：";
        if(catli1 > catli2){
            catli1 = catli2;
        }
        if(catli1 >= catli2 * 0.9){
            color(14);
        }else{
            color(15);
        }
        output(catli1);
        color(7);
        cout << "/";
        output(catli2);
        m1++;
    }
    if(zz15[5] > 0){
        color(15);
        block(1, m1);
        cout << "                    ";
        block(1, m1);
        color(11);
        cout << "科技点：";
        if(keji1 > keji2){
            keji1 = keji2;
        }
        if(keji1 >= keji2 * 0.9){
            color(14);
        }else{
            color(15);
        }
        output(keji1);
        color(7);
        cout << "/";
        output(keji2);
        m1++;
    }
    if(cat2 > 0){
        color(15);
        block(1, m1);
        cout << "                    ";
        block(1, m1);
        cout << "小猫：";
        if(cat1 == cat2){
            color(14);
        }
        cout << cat1;
        color(7);
        cout << "/" << cat2;
        m1++;
    }
    if(maopi1){
        color(15);
        block(1, m1);
        cout << "                    ";
        block(1, m1);
        color(13);
        cout << "毛皮：";
        color(15);
        output(maopi);
        m1++;
    }
    if(xiangya1){
        color(15);
        block(1, m1);
        cout << "                    ";
        block(1, m1);
        color(13);
        cout << "象牙：";
        color(15);
        output(xiangya);
        m1++;
    }
}

void output01(){
    color(15);
    for(int i = 4; i <= 23; i++){
        block(20, i);
        cout << "                         ";
    }
}

void output02(){
    color(15);
    if(tim3 == 18){
        tim3 = 0;
        tim2++;
    }
    if(tim2 == 100){
        tim2 = 0;
        tim1++;
    }
    if(tim1 == 5){
        tim1 = 1;
        tim0++;
    }
    if(zz31[1]){
        block(1, 1);
        cout << "                    ";
        block(1, 1);
        cout << "第" << tim0 << "年," << tim[tim1] << "第" << tim2 << "天";
    }else{
        block(1, 1);
        cout << tim[tim1];
    }
}

void output0(){
    for(int i = 1; i <= hengl; i++){
        if(i == x){
            color(0 + 15 * 16);
        }else{
            color(15);
        }
        block(i * 8 + 20, 1);
        cout << "       |";
        block(i * 8 + 20, 1);
        cout << hengs[heng[i]];
        block(i * 8 + 20, 2);
        cout << "-------|";
    }
}

void output13(){
    block(43, zz11);
    color(15);
    cout << "                     ";
    block(43, zz11 + 1);
    cout << "                     ";
    block(43, zz11 + 2);
    cout << "                     ";
}

void output12(int x1){
    color(15);
    if(shu[1][y] == 1){
        block(43, x1);
        cout << "1.采集";
    }else if(shu[1][y] == 3){
        block(43, x1);
        cout << "1.锻造100猫薄荷";
    }else{
        block(43, x1);
        cout << "1.建造";
        int i = 1;
        while(zz12[shu[1][y]][i] != 0){
            block(49, x1 + i - 1);
            output(zz12[shu[1][y]][i]);
            cout << zz14[zz13[shu[1][y]] % (int)(pow(10, i * 2)) / (int)(pow(10, (i * 2 - 2)))];
            i++;
        }
    }
    zz11 = x1;
}

void output11(int y1){
    for(int i = 1; i <= 5; i++){
        if(i > shul[1]){
            break;
        }
        if(y1 + i == y){
            output12(i * 3 + 1);
            color(0 + 15 * 16);
        }else{
            color(15);
        }
        block(25, i * 3 + 1);
        cout << "╭——————╮";
        block(25, i * 3 + 2);
        cout << "|              |";
        block(27, i * 3 + 2);
        cout << shus[1][shu[1][y1 + i]] << "(" << zz15[shu[1][y1 + i]] << ")";
        block(25, i * 3 + 3);
        cout << "╰——————╯";
    }
}

void output1(){
    if(x != 1){
        cout << "???";
        Sleep(500);
        return;
    }
    output13();
    if(shul[1] <= 5){
        output11(0);
    }else if(y < 3) {
        output11(0);
    }else if(y > shul[1] - 2){
        output11(shul[1] - 5);
    }else{
        output11(y - 3);
    }
}

void output31(int x3, int y3){
    if(x3 == y){
        block(43, x3 * 3 + 1);
        if(zz31[shu[3][y3]]){
            cout << "已研发";
        }else{
            cout << "1.研发"; 
            output(zz32[shu[3][y3]]);
            cout << "科技点";
        }
        color(0 + 15 * 16);
        zz33 = x3 * 3 + 1;
    }else{
        color(15);
    }
    block(25, x3 * 3 + 1);
    cout << "╭——————╮";
    block(25, x3 * 3 + 2);
    cout << "|              |";
    block(27, x3 * 3 + 2);
    cout << shus[3][shu[3][y3]];
    block(25, x3 * 3 + 3);
    cout << "╰——————╯";
}

void output3(){
    color(15);
    block(43, zz33);
    cout << "                       ";
    int x3 = 1;
    for(int i = 1; i <= shul[3]; i++){
        output31(x3, i);
        x3++;
    }
}

void output2(){
    color(15);
    block(43, zz23);
    cout << "                       ";
    block(43, zz23 + 1);
    cout << "                       ";
    block(43, zz23 + 2);
    cout << "                       ";
    for(int i = 1; i <= shul[2]; i++){
        if(i == y){
            block(43, i * 3 + 1);
            cout << "1.加";
            block(43, i * 3 + 2);
            cout << "2.减";
            if(shu[2][i] == 4){
                block(43, i * 3 + 3);
                cout << "3.派出猎人";
                if(catli1 > 199){
                    cout << "×" << (int)(catli1 / 100);
                }
            }
            color(0 + 15 * 16);
            zz23 = i * 3 + 1;
        }else{
            color(15);
        }
        block(25, i * 3 + 1);
        cout << "╭——————╮";
        block(25, i * 3 + 2);
        cout << "|              |";
        block(27, i * 3 + 2);
        cout << shus[2][shu[2][i]] << "(" << zz21[shu[2][i]] << ")";
        block(25, i * 3 + 3);
        cout << "╰——————╯";
    }
}

void output_1(){
    if(heng[x] == 1){
        output1();
    }else if(heng[x] == 3){
        output3();
    }else if(heng[x] == 2){
        output2();
    }
}

int main( ){
    system("mode con cols=70 lines=25");
    color(15);
    HideCursor();
    Sleep(1500);
    cout << "欢迎来到(高仿版)猫国建设者！" << endl;
    Sleep(1000);
    cout << "   //本游戏原型为 https://likexia.gitee.io/cat-zh#/" << endl;
    Sleep(500);
    cout << endl << "请按任意键继续……";
    char zzzzzzzzzzzzzzzzzzzz = getch();
    system("cls");
    output0();
    output00();
    output1();
    while(true){
        output00();
        output02();
        pan('w');
        pan('s');
        pan('a');
        pan('d');
        pan('1');
        pan('2');
        pan('3');
        if(check('w')){
            if(y > 0){
                y--;
                output_1();
            }
        }else if(check('s')){
            if(y < shul[heng[x]]){
                y++;
                output_1();
            }
        }else if(check('a')){
            if(y == 0 && x > 1){
                x--;
                output0();
                output01();
                output_1();
            }
        }else if(check('d')){
            if(y == 0 && x < hengl){
                x++;
                output0();
                output01();
                output_1();
            }
        }else if(check('1')){
            if(heng[x] == 1){
                if(shu[1][y] == 1){
                    bohe1 += 1;
                }else if(shu[1][y] == 3){
                    if(bohe1 >= 100){
                        bohe1 -= 100;
                        mutou1 += 1;
                    }
                }else{
                    h1 = true;
                    int i = 1;
                    while(zz12[shu[1][y]][i] != 0){
                        if(zz13[shu[1][y]] % (int)(pow(10, i * 2)) / (int)(pow(10, (i * 2 - 2))) == 1){
                            if(bohe1 < zz12[shu[1][y]][i]){
                                h1 = false;
                                break;
                            }
                        }else if(zz13[shu[1][y]] % (int)(pow(10, i * 2)) / (int)(pow(10, (i * 2 - 2))) == 2){
                            if(mutou1 < zz12[shu[1][y]][i]){
                                h1 = false;
                                break;
                            }
                        }else if(zz13[shu[1][y]] % (int)(pow(10, i * 2)) / (int)(pow(10, (i * 2 - 2))) == 3){
                            if(kuangwu1 < zz12[shu[1][y]][i]){
                                h1 = false;
                                break;
                            }
                        }else{
                            block(1, 19);
                            cout << zz13[shu[1][y]] % (int)(pow(10, i * 2)) / (int)(pow(10, (i * 2 - 2)));
                            cout << "?????";
                            Sleep(1500);
                        }
                        i++;
                    }
                    if(h1){
                        i = 1;
                        while(zz12[shu[1][y]][i] != 0){
                            if(zz13[shu[1][y]] % (int)(pow(10, i * 2)) / (int)(pow(10, (i * 2 - 2))) == 1){
                                zz15[shu[1][y]]++;
                                bohe1 -= zz12[shu[1][y]][i];
                                zz12[shu[1][y]][i] = (int)(pow(zz17[shu[1][y]], zz15[shu[1][y]]) * zz16[shu[1][y]][i] * 100 + 0.5) / 100.0;
                            }else if(zz13[shu[1][y]] % (int)(pow(10, i * 2)) / (int)(pow(10, (i * 2 - 2))) == 2){
                                zz15[shu[1][y]]++;
                                mutou1 -= zz12[shu[1][y]][i];
                                zz12[shu[1][y]][i] = (int)(pow(zz17[shu[1][y]], zz15[shu[1][y]]) * zz16[shu[1][y]][i] * 100 + 0.5) / 100.0;
                            }else if(zz13[shu[1][y]] % (int)(pow(10, i * 2)) / (int)(pow(10, (i * 2 - 2))) == 3){
                                zz15[shu[1][y]]++;
                                kuangwu1 -= zz12[shu[1][y]][i];
                                zz12[shu[1][y]][i] = (int)(pow(zz17[shu[1][y]], zz15[shu[1][y]]) * zz16[shu[1][y]][i] * 100 + 0.5) / 100.0;
                            }
                            i++;
                        }
                        if(shu[1][y] == 4){
                            cat2 += 2;
                            catli2 += 75;
                            if(!z1[1]){
                                hengl++;
                                heng[2] = 2;
                                heng[3] = 4;
                                shul[2] = 1;
                                z1[1] = true;
                                shul[1]++;
                                shu[1][5] = 5;
                                output0();
                            }
                        }else if(shu[1][y] == 5){
                            keji2 += 250;
                            if(!z1[2]){
                                hengl++;
                                heng[3] = 3;
                                heng[4] = 4;
                                shu[2][2] = 3;
                                shul[2]++;
                                z1[2] = true;
                            }
                        }else if(shu[1][y] == 6){
                            bohe2 += 5000;
                            mutou2 += 200;
                            kuangwu2 += 250;
                        }else if(shu[1][y] == 7){
                            if(!z1[3]){
                                shul[2]++;
                                shu[2][shul[2]] = 5;
                                sort(shu[2] + 1, shu[2] + shul[2] + 1, pai2);
                                shul[1]++;
                                shu[1][shul[1]] = 8;
                                sort(shu[1] + 1, shu[1] + shul[1] + 1, pai1);
                                z1[3] = true;
                            }
                        }
                    }
                }
                output1();
            }else if(heng[x] == 2){
                if(zz22 > 0){
                    zz21[shu[2][y]]++;
                    zz22--;
                    output2();
                }
            }else if(heng[x] == 3){
                if(keji1 >= zz32[shu[3][y]]){
                    zz31[shu[3][y]] = true;
                    keji1 -= zz32[shu[3][y]];
                    if(shu[3][y] == 1){
                        shul[3] = 1;
                        shu[3][1] = 2;
                        output_1();
                    }else if(shu[3][y] == 2) {
                        shul[3] = 2;
                        shu[3][1] = 3;
                        shu[3][2] = 4;
                        shu[2][2] = 2;
                        shu[2][3] = 3;
                        shul[2]++;
                        shul[1]++;
                        shu[1][6] = 6;
                    }else if(shu[3][y] == 3){
                        shu[3][y] = 5;
                        shul[2]++;
                        shu[2][shul[2]] = 4;
                        sort(shu[2] + 1, shu[2] + 1 + shul[2], pai2);
                        xinqing1 = true;
                    }else if(shu[3][y] == 4){
                        shu[3][y] = 6;
                        shul[1]++;
                        shu[1][shul[1]] = 7;
                        sort(shu[1] + 1, shu[1] + 1 + shul[1], pai1);
                    }
                    output3();
                }
            }
        }else if(check('2')){
            if(heng[x] == 1){

            }else if(heng[x] == 2){
                if(zz21[shu[2][y]] > 0){
                    zz21[shu[2][y]]--;
                    zz22++;
                    output2();
                }
            }
        }else if(check('3')){
            if(heng[x] == 1){

            }else if(heng[x] == 2){
                if(shu[2][y] == 4 && catli1 >= 100){
                    catli1 -= 100;
                    srand(time(NULL));
                    int sui1 = (rand() % 2001) + 3000;
                    int sui2 = (rand() % 1001);
                    int sui3 = (rand() % 3);
                    maopi1 = true;
                    maopi += sui1 / 100.0;
                    if(sui3 == 0){
                        xiangya1 = true;
                        xiangya += sui2 / 100.0; 
                    }
                }
            }
        }
        if(tim1 == 1){
            bohe1 += zz15[2] * 0.063 * 1.5;
        }else if(tim1 == 4){
            bohe1 += zz15[2] * 0.063 * 0.25;
        }else{
            bohe1 += zz15[2] * 0.063;
        }
        bohe1 -= cat1 * 0.4; 
        mutou1 += zz21[1] * 0.009 * xinqing / 100;
        bohe1 += zz21[2] * 0.5 * xinqing / 100;
        keji1 += zz21[3] * 0.0175 * (1 + 0.1 * zz15[5]) * xinqing / 100;
        catli1 += zz21[4] * 0.03 * xinqing / 100;
        kuangwu1 += zz21[5] * 0.025 * (1 + 0.2 * zz15[7]) * xinqing / 100;
        if(maopi > 0){
            maopi -= cat1 * 0.005;
            if(maopi < 0){
                maopi = 0;
            }
        }
        if(xiangya > 0){
            xiangya -= cat1 * 0.0035;
            if(xiangya < 0){
                xiangya = 0;
            }
        }
        if(!xinqing1 && cat1 > 4){
            xinqing1 = true;
        }
        xinqing = 100 - max(cat1 * 2 - 10, 0);
        if(maopi > 0){
            xinqing += 10;
        }
        if(xiangya > 0){
            xinqing += 10;
        }
        if(bohe1 <= 0 && cat1 > 0){
            timm2 = 0;
            bohe1 = 0;
            timm1++;
            if(timm1 == 54){
                cat1--;
                if(zz22 <= 0){
                    for(int i = 1; i <= shul[2]; i++){
                        if(zz21[shu[2][i]] > 0){
                            zz21[shu[2][i]]--;
                            break; 
                        }
                    }
                }else{
                    zz22--;
                }
                timm1 = 0;
            }
        }else{
            timm1 = 0;
            if(cat2 > cat1){
                timm2++;
                if(timm2 == 108){
                    cat1++;
                    zz22++;
                    timm2 = 0;
                }
            }
        }
        if(z1[30] == 0 && cat2 >= 8){
            hengs[2] = "村庄";
            z1[30] = true;
        }
        Sleep(100);
        tim3++;
    }
    return 0;
}
