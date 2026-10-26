#include<bits/stdc++.h>
#include<cstdio>
#include<cstdlib>
#include<ctime>
#include<windows.h>
using namespace std;
struct IDname{
    int geshu;
    string NAME;
};
IDname jue_se[100];
struct ID{
    int num;
    bool life;
    string name;
    int know;
    int how;
};
ID player[21];
int n, MY, kill1, kill2;
char a;
bool jieyao = 1, duyao = 1;
int lieren, shouwei = 0;
void init1(){
    jue_se[1].NAME = "村民 ";
    jue_se[2].NAME = "狼人 ";
    jue_se[3].NAME = "女巫 ";
    jue_se[4].NAME = "预言家 ";
    jue_se[5].NAME = "猎人 ";
    jue_se[6].NAME = "守卫 ";
}
void init2(int nn){
    switch (nn){
    case 6:
        jue_se[1].geshu = 3;
        jue_se[2].geshu = 2;
        jue_se[3].geshu = 1;
        jue_se[4].geshu = 0;
        jue_se[5].geshu = 0;
        jue_se[6].geshu = 0;
        break;
    case 7:
        jue_se[1].geshu = 3;
        jue_se[2].geshu = 2;
        jue_se[3].geshu = 1;
        jue_se[4].geshu = 1;
        jue_se[5].geshu = 0;
        jue_se[6].geshu = 0;
        break;
    case 8:
        jue_se[1].geshu = 3;
        jue_se[2].geshu = 3;
        jue_se[3].geshu = 1;
        jue_se[4].geshu = 1;
        jue_se[5].geshu = 0;
        jue_se[6].geshu = 0;
        break;
    case 9:
        jue_se[1].geshu = 3;
        jue_se[2].geshu = 3;
        jue_se[3].geshu = 1;
        jue_se[4].geshu = 1;
        jue_se[5].geshu = 1;
        jue_se[6].geshu = 0;
        break;
    case 10:
        jue_se[1].geshu = 4;
        jue_se[2].geshu = 3;
        jue_se[3].geshu = 1;
        jue_se[4].geshu = 1;
        jue_se[5].geshu = 1;
        jue_se[6].geshu = 0;
        break;
    case 11:
        jue_se[1].geshu = 4;
        jue_se[2].geshu = 4;
        jue_se[3].geshu = 1;
        jue_se[4].geshu = 1;
        jue_se[5].geshu = 1;
        jue_se[6].geshu = 0;
        break;
    case 12:
        jue_se[1].geshu = 4;
        jue_se[2].geshu = 4;
        jue_se[3].geshu = 1;
        jue_se[4].geshu = 1;
        jue_se[5].geshu = 1;
        jue_se[6].geshu = 1;
        break;
    default:
        cout << "输入错误,再见" << endl;
        exit(0);
        break;
    }
}
int van[10] = { 7,4,6,43,35,1,2,8,20,19 };
void init3(int nn){
    srand(time(0));
    Sleep(rand() % 44);
    int x = 10000;
    int t = rand();
    srand(time(NULL));
    int y = van[(rand() % 100 * van[rand() % 10] + t) % 10];
    if (nn <= 6){
    	x = abs(x * 6 / y) % 3 + 1;
	}else if (nn <= 8){
		x = abs(x * 7 / y) % 4 + 1;
	}else if (nn <= 11){
		x = abs(x * 8 / y) % 5 + 1;
	}else if (nn <= 14){
		x = abs(x * 9 / y) % 6 + 1;
	}  
    do{
        if (nn <= 6){
        	x = x % 3 + 1;
		}else if (nn <= 8){
			x = x % 4 + 1;
		}else if (nn <= 11){
			x = x % 5 + 1;
		}else if (nn <= 14){
			x = x % 6 + 1;
		}
        if (jue_se[x].geshu > 0){
            player[nn].name = jue_se[x].NAME;
            if (player[nn].name == "猎人 ") lieren = nn;
            if (player[nn].name == "守卫 ") shouwei = nn;
            player[nn].life = 1;
            player[nn].num = nn;
            player[nn].know = 0;
            jue_se[x].geshu--;
            player[nn].how = 0;
            break;
        }
    } while (jue_se[x].geshu == 0);
}
void printhhh(){
    int cm = 0;
    int sz = 0;
    for (int i = 1; i <= n; i++){
        if (player[i].life == 0){
        	continue;
		}else if (player[i].name == "村民 "){
			cm++;
		}else if (player[i].name == "女巫 " || player[i].name == "预言家 " || player[i].name == "猎人 " || player[i].name == "守卫 "){
			sz++;
		}
    }
    if (sz == 0 || cm == 0)
        cout << "狼人阵营胜利" << endl;
    else
        cout << "好人阵营胜利" << endl;
    for (int i = 1; i <= n; i++)
    {
        cout << left << setw(3) << player[i].num << ": " << player[i].name << " ";
        if (player[i].life == 0)
            cout << "死亡" << "\t";
        else
            cout << "存活" << "\t";
        if (player[i].how == 0)
            cout << "最终存活 " << endl;
        else if (player[i].how == 1)
            cout << "最终被狼人杀死" << endl;
        else if (player[i].how == 2)
            cout << "最终被投票投死" << endl;
        else if (player[i].how == 3)
            cout << "最终被女巫毒死" << endl;
        else if (player[i].how == 4)
            cout << "最终被猎人射杀" << endl;
    }
    system("pause");
    system("pause");
    system("pause");
}
void print(int day, int ti)
{
    HANDLE handle = GetStdHandle(STD_OUTPUT_HANDLE);
    if (ti == 0)
        SetConsoleTextAttribute(handle, BACKGROUND_INTENSITY | BACKGROUND_RED | BACKGROUND_GREEN | BACKGROUND_BLUE | FOREGROUND_INTENSITY);
    else
        SetConsoleTextAttribute(handle, FOREGROUND_INTENSITY | FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
    cout << "\t\t\t\t第" << day << "天 ";
    if (ti == 0)
        cout << "白天" << endl;
    else
        cout << "夜晚" << endl;
    cout << "我的位置:" << MY << "号" << endl;
    for (int i = 1; i <= 6; i++)
    {
        cout << player[i].num << "号位 ";
    }
    cout << endl;
    for (int i = 1; i <= 6; i++)
    {
        if (player[i].life == 1)
        {
            if (ti == 0)
                SetConsoleTextAttribute(handle, BACKGROUND_INTENSITY | BACKGROUND_RED | BACKGROUND_GREEN | BACKGROUND_BLUE | FOREGROUND_INTENSITY | FOREGROUND_GREEN);
            else
                SetConsoleTextAttribute(handle, FOREGROUND_INTENSITY | FOREGROUND_GREEN);
            cout << "存活 ";
        }
        else
        {
            if (ti == 0)
                SetConsoleTextAttribute(handle, BACKGROUND_INTENSITY | BACKGROUND_RED | BACKGROUND_GREEN | BACKGROUND_BLUE | FOREGROUND_INTENSITY | FOREGROUND_RED);
            else
                SetConsoleTextAttribute(handle, FOREGROUND_INTENSITY | FOREGROUND_RED);
            cout << "已死亡 ";
        }
    }
    if (ti == 0)
        SetConsoleTextAttribute(handle, BACKGROUND_INTENSITY | BACKGROUND_RED | BACKGROUND_GREEN | BACKGROUND_BLUE | FOREGROUND_INTENSITY);
    else
        SetConsoleTextAttribute(handle, FOREGROUND_INTENSITY | FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
    cout << endl;
    for (int i = 1; i <= 6; i++)
    {
        if (player[i].know == 0)
            cout << "未知 ";
        else if (player[i].know == 1)
        {
            if (player[i].name == "狼人 ")
                cout << "狼人 ";
            else
                cout << "好人 ";
        }
        else if (player[i].know == 2)
            cout << player[i].name << " ";
    }
    cout << endl << endl;
    for (int i = 7; i <= n; i++)
    {
        if (i < 10)
            cout << player[i].num << "号位 ";
        else
            cout << player[i].num << "号位 ";
    }
    cout << endl;
    for (int i = 7; i <= n; i++)
    {
        if (player[i].life == 1)
        {
            if (ti == 0)
                SetConsoleTextAttribute(handle, BACKGROUND_INTENSITY | BACKGROUND_RED | BACKGROUND_GREEN | BACKGROUND_BLUE | FOREGROUND_INTENSITY | FOREGROUND_GREEN);
            else
                SetConsoleTextAttribute(handle, FOREGROUND_INTENSITY | FOREGROUND_GREEN);
            cout << "存活 ";
        }
        else
        {
            if (ti == 0)
                SetConsoleTextAttribute(handle, BACKGROUND_INTENSITY | BACKGROUND_RED | BACKGROUND_GREEN | BACKGROUND_BLUE | FOREGROUND_INTENSITY | FOREGROUND_RED);
            else
                SetConsoleTextAttribute(handle, FOREGROUND_INTENSITY | FOREGROUND_RED);
            cout << "已死亡 ";
        }
    }
    if (ti == 0)
        SetConsoleTextAttribute(handle, BACKGROUND_INTENSITY | BACKGROUND_RED | BACKGROUND_GREEN | BACKGROUND_BLUE | FOREGROUND_INTENSITY);
    else
        SetConsoleTextAttribute(handle, FOREGROUND_INTENSITY | FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE);
    cout << endl;
    for (int i = 7; i <= n; i++)
    {
        if (player[i].know == 0)
            cout << "未知 ";
        else if (player[i].know == 1)
        {
            if (player[i].name == "狼人 ")
                cout << "狼人 ";
            else
                cout << "好人 ";
        }
        else if (player[i].know == 2)
            cout << player[i].name << " ";
    }
    cout << endl << endl;
}
int shou = 0;
void shoushui(int hhh, int hhhh)
{
    int x;
    Sleep(3000);
    system("cls");
    print(hhh, hhhh);
    cout << "守~卫~请~睁~眼~~~" << endl;
    Sleep(3000);
    system("cls");
    print(hhh, hhhh);
    if (MY == shouwei && player[MY].life == 1)
    {
        cout << "请问你要守护谁?" << endl << "输入:";
        cin >> x;
        while (x == shou || x<1 || x>n || player[x].life == 0)
        {
            cout << "输入错误,请重新输入" << endl << "输入:";
            cin >> x;
        }
        shou = x;
    }
    else if (player[shouwei].life == 1)
    {
        cout << "请问你要守护谁?" << endl;
        Sleep(rand() % 98);
        srand(time(0));
        x = rand() % n + 1;
        while (x == shou || player[x].life == 0)
        {
            Sleep(rand() % 98);
            srand(time(0));
            x = rand() % n + 1;
        }
        shou = x;
    }
    else
    {
        cout << "请问你要守护谁?" << endl;
        Sleep(3000);
        shou = -1;
    }
    Sleep(3000);
    system("cls");
    print(hhh, hhhh);
    cout << "守~卫~请~闭~眼~~~" << endl;
}
struct tou
{
    int xxx;
    int num;
    int toupiaoquan;
};
tou TOU[13];
bool cmp(tou x, tou y)
{
    if (x.xxx == y.xxx)
        return x.num < y.num;
    return x.xxx > y.xxx;
}
bool cmp1(tou x, tou y)
{
    return x.num < y.num;
}
void toupiao(int ddd, int nnn)
{
    //--------1--------
    int x;
    Sleep(2000);
    system("cls");
    print(ddd, nnn);
    cout << "现在大家请投票";
    for (int i = 1; i <= 3; i++)
    {
        cout << ".";
        Sleep(500);
    }
    cout << endl;
    for (int i = 1; i <= n; i++)
    {
        TOU[i].num = i;
        TOU[i].toupiaoquan = 1;
        TOU[i].xxx = 0;
    }
    for (int i = 1; i <= n; i++)
    {
        if (player[i].life == 1)
        {
            Sleep(3000);
            if (i == MY)
            {
                cout << "请投票...(0弃权)" << endl;
                cin >> x;
                while (player[x].life == 0 && x != 0)
                {
                    cin >> x;
                }
                if (x == 0)
                    cout << MY << "号玩家弃权" << endl;
                else
                    cout << MY << "号玩家投给了" << x << "号玩家" << endl;
            }
            else
            {
                srand(time(0));
                if (player[i].name == "狼人 ")
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || player[x].name == "狼人 " || x == i))
                    {
                        Sleep(rand() % 98);
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
                else if (player[i].name == "预言家 ")
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || player[x].name != "狼人 " || x == i))
                    {
                        Sleep(rand() % 98);
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
                else
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || x == i))
                    {
                        Sleep(rand() % 98);
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
            }
            if (x != 0)
                TOU[x].xxx++;
        }
    }
    Sleep(3000);
    sort(TOU + 1, TOU + n + 1, cmp);
    if (TOU[2].xxx != TOU[1].xxx)
    {
        cout << "投票结束," << TOU[1].num << "号投票出局" << endl;
        player[TOU[1].num].life = 0;
        player[TOU[1].num].how = 2;
        Sleep(3000);
        return;
    }
    else
    {
        TOU[1].toupiaoquan = 0;
        TOU[2].toupiaoquan = 0;
        system("cls");
        print(ddd, nnn);
        cout << TOU[1].num << "号," << TOU[2].num << "号";
        int i;
        for (i = 3; i <= n; i++)
        {
            if (TOU[i].xxx == TOU[1].xxx)
            {
                TOU[i].toupiaoquan = 0;
                cout << "," << TOU[i].num << "号";
            }
            else
                break;
        }
        if (i == n + 1)
        {
            for (int i = 1; i <= n; i++)
                TOU[i].toupiaoquan = 1;
        }
        cout << "平票" << endl;
    }
    //--------2--------
    sort(TOU + 1, TOU + n + 1, cmp1);
    cout << "请再次投票";
    for (int i = 1; i <= 3; i++)
    {
        cout << ".";
        Sleep(500);
    }
    cout << endl;
    for (int i = 1; i <= n; i++)
    {
        if (player[i].life == 1 && TOU[i].toupiaoquan == 1)
        {
            Sleep(3000);
            if (i == MY)
            {
                cout << "请投票...(0弃权)" << endl;
                cin >> x;
                while ((player[x].life == 0 || TOU[x].toupiaoquan == 1) && x != 0)
                {
                    cin >> x;
                }
                if (x == 0)
                    cout << MY << "号玩家弃权" << endl;
                else
                    cout << MY << "号玩家投给了" << x << "号玩家" << endl;
            }
            else
            {
                srand(time(0));
                if (player[i].name == "狼人 ")
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || player[x].name == "狼人 " || x == i || TOU[x].toupiaoquan == 1))
                    {
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
                else if (player[i].name == "预言家 ")
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || player[x].name != "狼人 " || x == i || TOU[x].toupiaoquan == 1))
                    {
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
                else
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || x == i || TOU[x].toupiaoquan == 1))
                    {
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
            }
            if (x != 0 && TOU[i].toupiaoquan == 1)
                TOU[x].xxx++;
        }
    }
    Sleep(3000);
    sort(TOU + 1, TOU + n + 1, cmp);
    if (TOU[2].xxx != TOU[1].xxx)
    {
        cout << "投票结束," << TOU[1].num << "号投票出局" << endl;
        player[TOU[1].num].life = 0;
        player[TOU[1].num].how = 2;
        Sleep(3000);
        return;
    }
    else
    {
        TOU[1].toupiaoquan = 0;
        TOU[2].toupiaoquan = 0;
        system("cls");
        print(ddd, nnn);
        cout << TOU[1].num << "号," << TOU[2].num << "号";
        int i;
        for (i = 3; i <= n; i++)
        {
            if (TOU[i].xxx == TOU[1].xxx)
            {
                TOU[i].toupiaoquan = 0;
                cout << "," << TOU[i].num << "号";
            }
            else
                break;
        }
        if (i == n + 1)
        {
            for (int i = 1; i <= n; i++)
                TOU[i].toupiaoquan = 1;
        }
        cout << "平票" << endl;
    }
    //--------3--------
    sort(TOU + 1, TOU + n + 1, cmp1);
    cout << "请再次投票";
    for (int i = 1; i <= 3; i++)
    {
        cout << ".";
        Sleep(500);
    }
    cout << endl;
    for (int i = 1; i <= n; i++)
    {
        if (player[i].life == 1 && TOU[i].toupiaoquan == 1)
        {
            Sleep(3000);
            if (i == MY)
            {
                cout << "请投票...(0弃权)" << endl;
                cin >> x;
                while ((player[x].life == 0 || TOU[x].toupiaoquan == 1) && x != 0)
                {
                    cin >> x;
                }
                if (x == 0)
                    cout << MY << "号玩家弃权" << endl;
                else
                    cout << MY << "号玩家投给了" << x << "号玩家" << endl;
            }
            else
            {
                srand(time(0));
                if (player[i].name == "狼人 ")
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || player[x].name == "狼人 " || x == i || TOU[x].toupiaoquan == 1))
                    {
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
                else if (player[i].name == "预言家 " || player[i].name == "猎人 ")
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || player[x].name != "狼人 " || x == i || TOU[x].toupiaoquan == 1))
                    {
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
                else
                {
                    x = rand() % (n + 1);
                    while (x != 0 && (player[x].life == 0 || x == i || TOU[x].toupiaoquan == 1))
                    {
                        srand(time(0));
                        x = rand() % (n + 1);
                    }
                    if (x == 0)
                        cout << i << "号玩家弃权" << endl;
                    else
                        cout << i << "号玩家投给了" << x << "号玩家" << endl;
                }
            }
            if (x != 0 && TOU[i].toupiaoquan == 1)
                TOU[x].xxx++;
        }
    }
    Sleep(3000);
    sort(TOU + 1, TOU + n + 1, cmp);
    if (TOU[2].xxx != TOU[1].xxx)
    {
        cout << "投票结束," << TOU[1].num << "号投票出局" << endl;
        player[TOU[1].num].life = 0;
        player[TOU[1].num].how = 2;
    }
    else
    {
        cout << "投票结束,无人出局" << endl;
    }
    Sleep(5000);
}
bool game_over()
{
    int pingmin = 0;
    int langren = 0;
    int shenzhi = 0;
    for (int i = 1; i <= n; i++)
    {
        if (player[i].life == 0)
            continue;
        if (player[i].name == "狼人 ")
            langren++;
        else if (player[i].name == "村民 ")
            pingmin++;
        else if (player[i].name == "女巫 " || player[i].name == "预言家 " || player[i].name == "猎人 ")
            shenzhi++;
    }
    if (shenzhi == 0 || langren == 0 || pingmin == 0)
        return 1;
    return 0;
}
void night()
{
    system("cls");
    system("color 0f");
    print(1, 1);
    cout << "天~黑~请~闭~眼~~~" << endl;
    if (n >= 12)
        shoushui(1, 1);
    Sleep(3000);
    system("cls");
    print(1, 1);
    cout << "狼~人~请~睁~眼~~~" << endl;
    if (player[MY].name == "狼人 ")
    {
        Sleep(1000);
        cout << "你的同伴有:";
        for (int i = 1; i <= n; i++)
        {
            if (i == MY)
                continue;
            if (player[i].name == "狼人 ")
            {
                cout << player[i].num << "号 ";
                player[i].know = 2;
            }
        }
        Sleep(3000);
        cout << endl << "请问你们要杀谁:" << endl << "输入:";
        cin >> kill1;
        Sleep(1500);
        system("cls");
        print(1, 1);
        cout << "今晚你们要杀的是" << kill1 << "号玩家" << endl;
    }
    else
    {
        Sleep(4000);
        system("cls");
        print(1, 1);
        cout << "请问你们要杀谁?" << endl;
        do
        {
            Sleep(rand() % 18);
            srand(time(0));
            int x = rand() % n + 1;
            if (player[x].name != "狼人 " && player[x].life == 1)
            {
                kill1 = x;
                break;
            }
        } while (1);
        Sleep(5000);
    }
    Sleep(3000);
    system("cls");
    print(1, 1);
    cout << "狼~人~请~闭~眼~~~" << endl;
    Sleep(2000);
    system("cls");
    print(1, 1);
    cout << "女~巫~请~睁~眼~~~" << endl;
    Sleep(2000);
    system("cls");
    print(1, 1);
    if (player[MY].name == "女巫 " && player[MY].life == 1)
    {
        Sleep(1000);
        if (jieyao == 1)
        {
            cout << "今晚" << kill1 << "号玩家被杀" << endl;
            Sleep(500);
            cout << "请问你要救吗???" << endl << "A. 救 B.不救" << endl << "输入:";
            cin >> a;
            if (a == 'A')
            {
                system("cls");
                print(1, 1);
                cout << "请问你要毒吗???" << endl;
                Sleep(2000);
                system("cls");
                print(1, 1);
                cout << "今晚" << kill1 << "号玩家被你解救" << endl;
                jieyao = 0;
                if (shou != kill1)
                    kill1 = 0;
            }
            else
            {
                if (shou == kill1)
                    kill1 = 0;
                Sleep(2000);
                system("cls");
                print(1, 1);
                cout << "请问你要毒吗???" << endl << "A. 毒 B.不毒" << endl << "输入:";
                cin >> a;
                if (a == 'A')
                {
                    cout << "请问你要毒谁???" << endl << "输入:";
                    cin >> kill2;
                    while (player[kill2].life != 1)
                    {
                        cout << "输入错误,请重新输入:" << endl;
                        cin >> kill2;
                    }
                    duyao = 0;
                }
            }
        }
        else
        {
            if (shou == kill1)
                kill1 = 0;
            Sleep(2000);
            system("cls");
            print(1, 1);
            cout << "请问你要毒吗???" << endl << "A. 毒 B.不毒" << endl << "输入:";
            cin >> a;
            if (a == 'A')
            {
                cout << "请问你要毒谁???" << endl << "输入:";
                cin >> kill2;
                while (player[kill2].life != 1)
                {
                    cout << "输入错误,请重新输入:" << endl;
                    cin >> kill2;
                }
                duyao = 0;
            }
        }
    }
    else
    {
        bool b = 0;
        cout << "请问你是否要用解药???" << endl;
        int FFF = 0, kkkk;
        for (int i = 1; i <= n; i++)
        {
            if (player[i].life == 1 && player[i].name == "村民 ")
                FFF++;
            if (player[i].name == "女巫 ")
                kkkk = i;
        }
        if (jieyao == 1 && player[kkkk].life == 1)
        {
            if (FFF == 1)
            {
                if (shou == kill1)
                    jieyao = 1;
                else
                    jieyao = 0;
                kill1 = 0;
                b = 1;
            }
            else
                for (int i = 1; i <= n; i++)
                {
                    if (player[i].name == "女巫 " && kill1 == i)
                    {
                        kill1 = 0;
                        if (shou == kill1)
                            jieyao = 1;
                        else
                            jieyao = 0;
                        b = 1;
                        break;
                    }
                    else if (player[i].name == "预言家 " && kill1 == i)
                    {
                        kill1 = 0;
                        if (shou == kill1)
                            jieyao = 1;
                        else
                            jieyao = 0;
                        b = 1;
                        break;
                    }
                }
        }
        Sleep(3000);
        if (b == 0 && duyao == 1 && player[kkkk].life == 1)
        {
            system("cls");
            print(1, 1);
            cout << "请问你是否要用毒药???" << endl;
            srand(time(0));
            int x = rand() % 2;
            Sleep(1500);
            cout << "请问你要毒谁???" << endl;
            if (x == 1)
            {
                duyao = 0;
                int y = rand() % n + 1;
                while ((player[y].name == "女巫 " || player[y].name == "预言家 " || y == kill1) || player[y].life == 0)
                    y = rand() % n + 1;
                kill2 = y;
            }
        }
        else
        {
            Sleep(3000);
            system("cls");
            print(1, 1);
            cout << "请问你是否要用毒药???" << endl;
            Sleep(3000);
            cout << "请问你要毒谁???" << endl;
            Sleep(3000);
        }
    }
    Sleep(3000);
    system("cls");
    print(1, 1);
    cout << "女~巫~请~闭~眼~~~" << endl;
    if (n > 6)
    {
        Sleep(3000);
        system("cls");
        print(1, 1);
        cout << "预~言~家~请~睁~眼~~~" << endl;
        if (player[MY].name == "预言家 ")
        {
            Sleep(3000);
            cout << "请问你想查验谁???" << endl << "输入:";
            int x;
            cin >> x;
            player[x].know = 1;
            Sleep(2000);
            system("cls");
            print(1, 1);
            cout << "他的身份是:";
            if (player[x].name == "狼人 ")
                cout << "狼人" << endl;
            else
                cout << "好人" << endl;
            Sleep(3000);
        }
        else
        {
            Sleep(3000);
            cout << "请问你想查验谁???" << endl;
            Sleep(3000);
            system("cls");
            print(1, 1);
            cout << "他的身份是:......";
            Sleep(3000);
        }
        Sleep(3000);
        system("cls");
        print(1, 1);
        cout << "预~言~家~请~闭~眼~~~" << endl;
    }
    Sleep(3000);
    if (kill1 != 0)
        player[kill1].life = 0;
    if (kill2 != 0)
        player[kill2].life = 0;
    player[kill1].how = 1;
    player[kill2].how = 3;
    system("cls");
    system("color F0");
    print(2, 0);
}
void night2(int hhh, int hhhh)
{
    system("cls");
    system("color 0f");
    print(hhh, hhhh);
    cout << "天~黑~请~闭~眼~~~" << endl;
    if (n >= 12)
        shoushui(hhh, hhhh);
    Sleep(3000);
    system("cls");
    print(hhh, hhhh);
    cout << "狼~人~请~睁~眼~~~" << endl;
    if (player[MY].name == "狼人 " && player[MY].life == 1)
    {
        Sleep(3000);
        cout << endl << "请问你们要杀谁:" << endl << "输入:";
        cin >> kill1;
        Sleep(1500);
        system("cls");
        print(hhh, hhhh);
        cout << "今晚你们要杀的是" << kill1 << "号玩家" << endl;
    }
    else
    {
        Sleep(4000);
        system("cls");
        print(hhh, hhhh);
        cout << "请问你们要杀谁?" << endl;
        do
        {
            srand(time(0));
            int x = rand() % n + 1;
            if (player[x].name != "狼人 " && player[x].life == 1)
            {
                kill1 = x;
                break;
            }
        } while (1);
        Sleep(5000);
    }
    Sleep(3000);
    system("cls");
    print(hhh, hhhh);
    cout << "狼~人~请~闭~眼~~~" << endl;
    Sleep(2000);
    system("cls");
    print(hhh, hhhh);
    cout << "女~巫~请~睁~眼~~~" << endl;
    Sleep(2000);
    system("cls");
    print(hhh, hhhh);
    if (player[MY].name == "女巫 " && player[MY].life == 1)
    {
        Sleep(1000);
        if (jieyao == 1)
        {
            cout << "今晚" << kill1 << "号玩家被杀" << endl;
            Sleep(500);
            cout << "请问你要救吗???" << endl << "A. 救 B.不救" << endl << "输入:";
            cin >> a;
            if (a == 'A')
            {
                system("cls");
                print(hhh, hhhh);
                cout << "请问你要毒吗???" << endl;
                Sleep(2000);
                system("cls");
                print(hhh, hhhh);
                cout << "今晚" << kill1 << "号玩家被你解救" << endl;
                jieyao = 0;
                if (shou != kill1)
                    kill1 = 0;
            }
            else
            {
                if (shou == kill1)
                    kill1 = 0;
                Sleep(2000);
                system("cls");
                print(hhh, hhhh);
                cout << "请问你要毒吗???" << endl << "A. 毒 B.不毒" << endl << "输入:";
                cin >> a;
                if (a == 'A')
                {
                    cout << "请问你要毒谁???" << endl << "输入:";
                    cin >> kill2;
                    while (player[kill2].life != 1)
                    {
                        cout << "输入错误,请重新输入:" << endl;
                        cin >> kill2;
                    }
                    duyao = 0;
                }
            }
        }
        else if (duyao == 1)
        {
            if (shou == kill1)
                kill1 = 0;
            Sleep(2000);
            system("cls");
            print(hhh, hhhh);
            cout << "请问你要毒吗???" << endl << "A. 毒 B.不毒" << endl << "输入:";
            cin >> a;
            if (a == 'A')
            {
                cout << "请问你要毒谁???" << endl << "输入:";
                cin >> kill2;
                while (player[kill2].life != 1)
                {
                    cout << "输入错误,请重新输入:" << endl;
                    cin >> kill2;
                }
                duyao = 0;
            }
        }
        else
        {
            Sleep(2000);
            system("cls");
            print(hhh, hhhh);
            cout << "请问你要毒吗???" << endl;
        }
    }
    else
    {
        bool b = 0;
        cout << "请问你是否要用解药???" << endl;
        int FFF = 0, kkkk;
        for (int i = 1; i <= n; i++)
        {
            if (player[i].life == 1 && player[i].name == "村民 ")
                FFF++;
            if (player[i].name == "女巫 ")
                kkkk = i;
        }
        if (jieyao == 1 && player[kkkk].life == 1)
        {
            if (FFF == 1)
            {
                if (shou == kill1)
                    jieyao = 1;
                else
                    jieyao = 0;
                kill1 = 0;
                b = 1;
            }
            else
                for (int i = 1; i <= n; i++)
                {
                    if (player[i].name == "女巫 " && kill1 == i)
                    {
                        kill1 = 0;
                        if (shou == kill1)
                            jieyao = 1;
                        else
                            jieyao = 0;
                        b = 1;
                        break;
                    }
                    else if (player[i].name == "预言家 " && kill1 == i)
                    {
                        kill1 = 0;
                        if (shou == kill1)
                            jieyao = 1;
                        else
                            jieyao = 0;
                        b = 1;
                        break;
                    }
                }
        }
        Sleep(3000);
        if (b == 0 && duyao == 1 && player[kkkk].life == 1)
        {
            system("cls");
            print(hhh, hhhh);
            cout << "请问你是否要用毒药???" << endl;
            srand(time(0));
            int x = rand() % 2;
            Sleep(1500);
            cout << "请问你要毒谁???" << endl;
            if (x == 1)
            {
                duyao = 0;
                int y = rand() % n + 1;
                while ((player[y].name == "女巫 " || player[y].name == "预言家 " || y == kill1) || player[y].life == 0)
                    y = rand() % n + 1;
                kill2 = y;
            }
        }
        else
        {
            Sleep(3000);
            system("cls");
            print(hhh, hhhh);
            cout << "请问你是否要用毒药???" << endl;
            Sleep(3000);
            cout << "请问你要毒谁???" << endl;
            Sleep(3000);
        }
    }
    Sleep(3000);
    system("cls");
    print(hhh, hhhh);
    cout << "女~巫~请~闭~眼~~~" << endl;
    if (n > 6)
    {
        Sleep(3000);
        system("cls");
        print(hhh, hhhh);
        cout << "预~言~家~请~睁~眼~~~" << endl;
        if (player[MY].name == "预言家 " && player[MY].life == 1)
        {
            Sleep(3000);
            cout << "请问你想查验谁???" << endl << "输入:";
            int x;
            cin >> x;
            player[x].know = 1;
            Sleep(2000);
            system("cls");
            print(hhh, hhhh);
            cout << "他的身份是:";
            if (player[x].name == "狼人 ")
                cout << "狼人" << endl;
            else
                cout << "好人" << endl;
            Sleep(3000);
        }
        else
        {
            Sleep(3000);
            cout << "请问你想查验谁???" << endl;
            Sleep(3000);
            system("cls");
            print(hhh, hhhh);
            cout << "他的身份是:......";
            Sleep(3000);
        }
        Sleep(3000);
        system("cls");
        print(hhh, hhhh);
        cout << "预~言~家~请~闭~眼~~~" << endl;
    }
    Sleep(3000);
    if (kill1 != 0)
        player[kill1].life = 0;
    if (kill2 != 0)
        player[kill2].life = 0;
    player[kill1].how = 1;
    player[kill2].how = 3;
    system("cls");
    system("color F0");
    print(hhh + 1, 0);
}
bool lr = 0;
void panduanlieren()
{
    if (lr == 1)
        return;
    if (MY == lieren)
    {
        cout << "请射杀一名玩家" << endl;
        int x;
        cin >> x;
        while (player[x].life != 1)
        {
            cout << "输入错误,请重新输入" << endl;
            cin >> x;
        }
        Sleep(1000);
        cout << lieren << "号猎人发动技能,开枪带走了" << x << "号" << endl;
        player[x].life = 0;
        player[x].how = 4;
    }
    else if (n >= 9)
    {
        srand(time(0));
        int x = rand() % n + 1;
        while (player[x].life != 1)
        {
            x = rand() % n + 1;
        }
        Sleep(1000);
        cout << lieren << "号猎人发动技能,开枪带走了" << x << "号" << endl;
        player[x].life = 0;
        player[x].how = 4;
    }
    lr = 1;
}
void print1()
{
    cout << "天亮了,昨晚";
    if (kill1 != 0 || kill2 != 0)
    {
        cout << kill1 << "号";
        if (kill2 != 0)
        {
            cout << "," << kill2 << "号";
            kill2 = 0;
        }
        cout << "被杀" << endl;
    }
    else
        cout << "是平安夜" << endl;
}
int main()
{
    system("cls");
    cout << " " << "狼人杀  作者：朱炳宇" << endl;
    cout << "请输入人数个数（6人及以上，12人及以下）:" << endl;
    scanf("%d", &n);
    cout << "加载时间长，请耐心等待";
    init1();
    init2(n);
    int k = 1;
    do
    {
        srand(time(0));
        init3(k);
        cout << ".";
        Sleep(17);
        k++;
    } while (k <= n);
    system("cls");
    system("color F0");
    cout << "游戏即将开始";
    for (int i = 1; i <= 6; i++)
    {
        cout << ".";
        Sleep(500);
    }
    Sleep(1500);
    cout << endl << endl << "请大家查看身份牌......" << endl;
    Sleep(45);
    srand(time(0));
    MY = rand() % n + 1;
    cout << "您的身份是:" << player[MY].name << endl;
    Sleep(500);
    cout << "在" << player[MY].num << "号位上" << endl;
    system("pause");
    system("cls");
    player[MY].know = 2;
    print(1, 0);
    cout << "即将进入夜晚";
    for (int i = 1; i <= 6; i++)
    {
        cout << ".";
        Sleep(500);
    }
    night();
    print1();
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    if (player[lieren].life == 0 && lr == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    toupiao(2, 0);
    system("cls");
    print(2, 0);
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    else if (player[lieren].life == 0 && lr == 0)
    {
        panduanlieren();
    }
    cout << "即将进入夜晚";
    for (int i = 1; i <= 6; i++)
    {
        cout << ".";
        Sleep(500);
    }
    night2(2, 1);
    print1();
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    if (player[lieren].life == 0 && lr == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    toupiao(3, 0);
    system("cls");
    print(3, 0);
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    else if (player[lieren].life == 0 && lr == 0)
    {
        panduanlieren();
    }
    cout << "即将进入夜晚";
    for (int i = 1; i <= 6; i++)
    {
        cout << ".";
        Sleep(500);
    }
    night2(3, 1);
    print1();
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    if (player[lieren].life == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    toupiao(4, 0);
    system("cls");
    print(4, 0);
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    else if (player[lieren].life == 0 && lr == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    cout << "即将进入夜晚";
    for (int i = 1; i <= 6; i++)
    {
        cout << ".";
        Sleep(500);
    }
    night2(4, 1);
    print1();
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    if (player[lieren].life == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    toupiao(5, 0);
    system("cls");
    print(5, 0);
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    else if (player[lieren].life == 0 && lr == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    cout << "即将进入夜晚";
    for (int i = 1; i <= 6; i++)
    {
        cout << ".";
        Sleep(500);
    }
    night2(5, 1);
    print1();
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    if (player[lieren].life == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    toupiao(6, 0);
    system("cls");
    print(6, 0);
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    else if (player[lieren].life == 0 && lr == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    cout << "即将进入夜晚";
    for (int i = 1; i <= 6; i++)
    {
        cout << ".";
        Sleep(500);
    }
    night2(6, 1);
    print1();
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    if (player[lieren].life == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    toupiao(7, 0);
    system("cls");
    print(7, 0);
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    else if (player[lieren].life == 0 && lr == 0)
    {
        panduanlieren();
    }
    if (game_over())
    {
        Sleep(1000);
        system("cls");
        cout << "游戏结束" << endl; printhhh();
        return 0;
    }
    while (1)
        system("pause");
    return 0;
}
