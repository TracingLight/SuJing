---
title: 虚函数详解
date: '2026-11-18 22:24:56'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 从同一个基类引用为什么能调用不同函数讲起，通过可运行的例子理解C++虚函数、override、对象切片和虚析构，再用sizeof和汇编观察虚函数表与虚指针。
copyright: true
updated: '2026-11-18 23:34:45'
cover: /img/covers/preview-upscaled-4x-mwma3qjj.webp
---

# 虚函数详解

观前提醒：建议先阅读[继承](/2026/09/16/学习笔记-c-面向对象-介绍c-中public继承的-is/)

> 明明传进去的是一个 `Student`，为什么打印出来的是 `Person`？能不能让同一个函数收到学生就打印 `Student`，收到老师就打印 `Teacher`？

## 同一个学生，为什么打印出了两个身份？

上一篇聊到，`Student` 公开继承 `Person`，表达的是「学生是一种人」

那我写一个接收 `Person` 引用的函数，拿它来打印学生的身份，应该没什么问题吧？先猜一下下面会输出什么

```cpp
#include <iostream>

struct Person
{
    const char* role() const
    {
        return "Person";
    }
};

struct Student : Person
{
    const char* role() const
    {
        return "Student";
    }
};

void printRole(const Person& person)
{
    std::cout << person.role() << '\n';
}

int main()
{
    Student student;
    std::cout << student.role() << '\n';
    printRole(student);
}
```

```text
Student
Person
```

同一个对象，换个地方调用，结果就不一样了

问题不在于 `printRole` 把学生变成了普通人，它拿到的是引用，没有复制对象

`student.role()` 里的 `student` 声明为 `Student`，所以直接调用了 `Student` 的版本

到了 `printRole` 里面，参数声明为 `const Person&`，按普通成员函数的调用规则，`person.role()` 就选了 `Person` 的版本

可我们想要的是，`printRole` 仍然接收 `Person` 引用，打印的却是实际传进来的那个对象的身份

C++ 允许基类把成员函数声明成**虚函数**，让派生类提供自己的版本

把基类 `Person` 的 `role()` 改成下面这样，注意返回类型前面多了一个 `virtual`

```cpp
virtual const char* role() const
{
    return "Person";
}
```

再跑一次，两个地方都输出 `Student`

原来函数里的 `person.role()` 会按参数声明里的 `Person` 选版本

加了 `virtual` 以后，这行代码接到 `Student` 对象，就会调用 `Student` 提供的版本

派生类给基类的虚函数提供自己的版本，这个动作叫**重写**

以后再加一个 `Teacher`，只要它也重写 `role()`，同一个 `printRole` 就能在接到老师对象时打印 `Teacher`

同一处调用会随实际对象选择不同的实现，这就是**运行时多态**

这里按实际对象选择版本的过程也叫**虚派发**

### 一个引用，怎么会扯出两种类型？

还是看 `printRole(student)`：

- **静态类型**：从代码上就能知道，比如 `p` 声明为 `const Person*`，那 `p` 的静态类型就是 `const Person*`。对 `person.role()` 来说，编译器从 `Person` 的接口查找 `role`
- **动态类型**：看这次实际访问的是哪个对象，把 `student` 传进去，这次引用绑定到的是一个 `Student`；把一个普通 `Person` 传进去，实际对象就是 `Person`

**先根据静态类型找到要调用的成员，如果这个成员是虚函数，普通调用就会根据动态类型选版本**

在这个例子里，`Student` 重写了 `role()` 就用 `Student` 的版本，要是它没有重写，就沿用 `Person` 的版本

指针也是同一个道理，把 `&student` 交给 `const Person* p`，`p->role()` 会调用 `Student::role()`

但就算 `Student` 另有一个 `studentId()`，你也不能直接写 `p->studentId()`，因为 `Person` 的接口里没这个函数

还有一种情况是你本来就想指定基类版本，写 `person.Person::role()` 即可，这里的 `Person::` 会绕过虚派发

### override：少写一个 const，怎么就不重写了？

派生类重写的函数仍然是虚函数，可以在声明的末尾加上 `override`，告诉编译器「我想重写基类的虚函数，请帮我检查这个声明对不对」

```cpp
struct Student : Person
{
    const char* role() const override
    {
        return "Student";
    }
};
```

试一下把 `role()` 后面的 `const` 删掉：

```cpp
//假设基类的role()后面还带着const
const char* role() override  //编译错误
{
    return "Student";
}
```

注意，漏掉的是括号**后面**的 `const`，不是返回值前面的那个

括号后面的 `const` 决定这个成员函数能不能在 `const` 对象上调用，判断能不能重写时也要看它

如果连 `override` 也一起删掉，这段代码反而能编译

这时 `Student` 只是多了一个叫 `role()` 的成员，把基类的同名成员藏起来了，并没有重写它

拿一个普通的 `Student` 直接试，输出的是 `Student`，放进 `printRole` 再试一次，输出就变回 `Person` 了

==`override` 不是开启多态的开关，它是让编译器替你检查「我写的到底是不是重写」==

顺手区分三个容易混在一起的词：

- **重载**：同一作用域里用不同参数提供多个同名函数
- **重写**：派生类给基类的虚函数提供自己的版本
- **隐藏**：派生类声明了同名成员，普通名字查找就看不到基类的同名成员了

要确认自己写的是重写，别只看函数名，直接用 `override` 让编译器帮你检查

### 把 & 去掉，virtual 也救不回来了

继续用加了 `virtual` 和 `override` 的版本，把下面几行放进 `main`：

```cpp
Student student;
const Person& view = student;  //借用原来的Student对象
Person copy = student;         //创建一个新的Person对象

printRole(view);  //Student
printRole(copy);  //Person
```

`copy` 不是换个角度看学生，它就是一个新建的 `Person` 对象

创建它时，只复制了基类部分，`Student` 自己的部分没跟过来，这叫**对象切片**

即使例子里的 `Student` 没有新增数据成员，新对象的类型也已经是 `Person`，所以打印不出 `Student`

把 `printRole` 的参数改成 `Person person` 也是一样，调用时会先复制出一个 `Person`

把 `Student` 放进 `std::vector<Person>`，容器里存的也只是 `Person`

如果只是借用，用引用或指针就能保留原来的对象。如果容器还要负责销毁这些对象，可以用 `std::vector<std::unique_ptr<Person>>`，不过得先弄清楚下面的销毁规则

## 基类不想提供默认实现怎么办？

上面的 `Person` 可以有一个默认身份，但有些时候我们只想要求「每种派生类都该知道自己的身份」，并不想给一个默认答案

在 `role()` 的声明末尾写 `= 0`，就可以把它声明为**纯虚函数**

先看 `Person` 怎么提出这个要求，`Student` 又怎么给出自己的答案

```cpp
struct Person
{
    virtual const char* role() const = 0;
};

struct Student final : Person
{
    const char* role() const override
    {
        return "Student";
    }
};
```

`Person` 把 `role()` 声明为纯虚函数后，就成了**抽象类**，不能再写 `Person person;` 来创建对象

但 `Person&` 和 `Person*` 还是能接收具体的学生对象

把示例里的 `Student::role()` 删掉试试，这时 `Student` 也成了抽象类，连 `Student student;` 都编译不过

这里的 `final` 也可以先去掉，它跟纯虚函数没有绑定关系

写在类名后面，表示不允许再从 `Student` 派生；写在函数声明末尾，比如 `role() const override final`，表示不允许派生类再重写这个函数

## 有虚函数，析构函数就必须是虚的吗？

回到前面的 `printRole`，它只是借用对象，不负责销毁

局部变量 `Student student;` 离开作用域时，会先析构 `Student`，再析构它的 `Person` 部分，哪怕 `Person` 的析构不是虚函数

前面用 `virtual` 修饰了 `role()`，析构函数 `~Person()` 也能这样声明，这就叫**虚析构函数**

它让普通的 `delete` 能通过基类指针从实际的派生类开始析构

先看一个只给 `role()` 加了 `virtual` 的场景

沿用[智能指针详解](/2026/11/15/学习笔记-c-智能指针/)的用法，`owner` 负责管理学生对象，`get()` 借出地址

```cpp
auto owner = std::make_unique<Student>();
Person* p = owner.get();        //借出指针，实际对象仍由owner管理
std::cout << p->role() << '\n';  //可以正常走虚调用
//delete p;  //不要执行：通过非虚析构的基类指针删除派生对象
```

**能通过 `p` 调用 `role()`，不代表也能通过 `p` 删除对象**

调用看的是 `role()`，删除看的是 `~Person()`

在这里，用普通的单对象 `delete` 通过 `Person*` 删除 `Student`，而 `Person` 又没有虚析构，结果是**未定义行为**，也就是 C++ 不保证程序会发生什么

哪怕某一次运行看起来「只调用了 `~Person()`」，也不能把这个输出当成规则，`Student` 没有额外成员也不例外

### 允许通过基类删除：public virtual

如果接口就是要让调用方拿着 `Person*` 或者 `unique_ptr<Person>` 管理派生对象，那就让 `Person` 提供公开的虚析构：

```cpp
#include <iostream>
#include <memory>

struct Person
{
    virtual ~Person()
    {
        std::cout << "~Person\n";
    }
};

struct Student : Person
{
    ~Student() override
    {
        std::cout << "~Student\n";
    }
};

int main()
{
    std::unique_ptr<Person> person = std::make_unique<Student>();
}
```

输出是：

```text
~Student
~Person
```

这里特意只留了析构函数，方便看清楚：**即使 `Person` 没有别的虚函数，只要你想支持这种销毁方式，那一行虚析构就有用**

工程里不需要打印日志时，通常写 `virtual ~Person() = default;` 就够了，派生类如果没有要自己做的清理，连析构都不必手写

虚析构确保从正确的派生类析构开始

然后派生类的成员、基类子对象再按析构规则依次清理，这部分不是每一级都重新做一次虚派发

### 不允许外部通过基类删除：protected 非虚

换一种设计，`Person` 只想提供用来借用的接口，调用方根本不该拿 `Person*` 去删除对象

那可以把析构函数设为 `protected`：

```cpp
struct Person
{
    virtual const char* role() const
    {
        return "Person";
    }

protected:
    ~Person() = default;
};

struct Student : Person
{
    const char* role() const override
    {
        return "Student";
    }
};

int main()
{
    Student student;  //离开作用域时正常析构
    Person* view = &student;
    view->role();
    //delete view;  //取消注释会报错：Person的析构函数不可访问
}
```

外部代码可以通过 `Person*` 借用对象，但不能拿它去 `delete`，对象由知道具体类型的那一方管理

注意，`protected` 只是挡住了外部调用，不会让非虚析构突然支持多态删除

就算在 `Person` 里加个 `destroy()`，在函数里执行 `delete this;`，也还是在通过 `Person*` 删除对象，访问权限变了，普通 `delete` 的类型规则没变

### 换成智能指针就不用管了吗？

这个问题跟[智能指针详解](/2026/11/15/学习笔记-c-智能指针/)里的「谁来释放」正好接上

| 写法 | 谁来决定怎么销毁？ |
| --- | --- |
| `std::unique_ptr<Person> p = std::make_unique<Student>();` | 转换后的默认删除器按 `Person*` 执行 `delete`，这种设计要有公开的虚析构 |
| `std::shared_ptr<Person> p = std::make_shared<Student>();` | 创建所有权时已经记录了怎样销毁 `Student`，转成基类指针之后，这条路径仍然能正确清理 |

`shared_ptr` 也不是每次都能帮你保住派生类型

比如先把地址存成 `Person*`，再把这个裸指针交给 `shared_ptr<Person>`，它不会替你找回之前已经丢掉的类型信息

**关键是建立所有权时，用的是什么销毁方式，而不是指针名字里有没有 `shared`**

顺带一提，写出 `~Person() = default;` 也算**用户声明了析构函数**，所以编译器不会再为这个类隐式声明移动构造和移动赋值

这不是 `virtual` 独有的副作用，也不代表传右值一定会报错：还可能匹配到拷贝

多态接口通常不需要让调用方按值复制它，不必为了这个细节机械地补一排 `= default`

## 构造和析构的时候，调虚函数又会怎样？

刚才说普通虚调用会找实际对象的实现

那如果 `Person` 构造函数里就写一句 `role()`，它会不会调用 `Student::role()`？

```cpp
#include <iostream>

struct Person
{
    Person()
    {
        std::cout << "ctor: " << role() << '\n';
    }
    virtual ~Person()
    {
        std::cout << "dtor: " << role() << '\n';
    }
    virtual const char* role() const
    {
        return "Person";
    }
};

struct Student : Person
{
    const char* role() const override
    {
        return "Student";
    }
};

int main()
{
    Student student;
    std::cout << "ready: " << student.role() << '\n';
}
```

```text
ctor: Person
ready: Student
dtor: Person
```

构造走到 `Person` 这一层时，`Student` 的部分还没初始化

反过来，析构走到 `Person` 这一层时，`Student` 的部分已经先销毁了

所以对正在构造或析构的那个对象调用虚函数时，C++ 不会跳到比当前这一层更派生的版本

这和上一节的虚析构不矛盾：

- 通过基类指针 `delete`，是在决定**从哪个析构开始**
- 进入 `~Person()` 之后再调 `role()`，是在看**析构已经走到了哪一层**

如果某个函数要用到 `Student` 初始化好的数据，就等整个对象构造完成以后再调

## 虚函数表和虚指针：编译器到底怎么找到函数？

这一节单独写个小程序，直接在 Visual Studio 里看一次虚调用

基类有两个虚函数，两个派生类都只重写第一个，第二个留着用基类的版本

```cpp
#include <iostream>

class Base
{
public:
    virtual void func1()
    {
    }

    virtual void func2()
    {
    }
};

class Derived : public Base
{
public:
    void func1() override
    {
        std::cout << "Derived\n";
    }
};

class Derived2 : public Base
{
public:
    void func1() override
    {
        std::cout << "Derived2\n";
    }
};

int main()
{
    Derived first;
    Derived2 second;
    Base* p = &first;
    Base* q = &second;

    p->func1();
    q->func1();
    return 0;
}
```

两行分别输出 `Derived` 和 `Derived2`，虽然 `p` 和 `q` 都是 `Base*`，但它们指向的对象不同

这里用局部对象，两个指针只负责借用，不需要写 `delete`。截图里对象的创建方式和上面不同，我们只看对象还活着时的虚调用

### 快速监视：表里到底放了什么？

用 Visual Studio 的 Debug x64 配置，在 `p->func1();` 处打断点，暂停后选中 `p`，按 Shift+F9 打开「快速监视」

展开 `p`，可以看到它声明为 `Base*`，但当前指向的是一个 `Derived` 对象

![Visual Studio 快速监视：展开 p 的 __vfptr，看到 Derived::func1 和 Base::func2](/img/posts/cpp-virtual-vfptr.png)

图里的 `__vfptr` 就是 MSVC 展示的**虚指针（vptr）**，它指向一张记录虚函数入口的表，这张表叫**虚函数表（vtable）**

表里的每个位置叫**表项**，这张图里看两项就够了：

- `[0]` 是 `Derived::func1`，因为 `Derived` 重写了 `func1()`
- `[1]` 是 `Base::func2`，因为 `Derived` 没重写 `func2()`

仔细看，上下两处 `__vfptr` 显示的是同一个地址，不是这个对象里存了两份表

再看 `q`，`func1()` 还是查同一个位置，只不过那份表里放的是 `Derived2::func1`

==C++ 保证虚调用选对函数，但没规定编译器一定要用虚表，也没规定虚指针一定放在对象开头==

### 反汇编：从调用处跟进去（进阶）

停在 `p->func1();` 时打开「反汇编」，它会把程序里的机器指令显示成能读的汇编。第一次看不用读整屏，盯着红框这四行就够了

![Visual Studio 反汇编：p->func1() 处读取虚指针并根据表项调用](/img/posts/cpp-virtual-call-site.webp)

```asm
mov rax, qword ptr [p]
mov rax, qword ptr [rax]
mov rcx, qword ptr [p]
call qword ptr [rax]
```

`rax` 和 `rcx` 是 CPU 里临时存数据的位置，叫**寄存器**。这里可以把方括号理解成「到这个地址读一个值」

1. 第一行把 `p` 存着的对象地址读进 `rax`
2. 第二行从对象开头读出虚指针，这时 `rax` 里已经是虚表地址
3. 第三行把对象地址放进 `rcx`，传给即将调用的成员函数，函数里的 `this` 就是指向当前对象的指针
4. 最后一行从虚表的第一项读出函数地址，再调用它，这就是**间接调用**，指令里没有写死要调用 `Derived::func1`

在反汇编窗口里单步走到 `call` 再步入，就能看到执行进入 `Derived::func1`。调试器有时会先停在一个跳转入口，继续单步就能看到函数体

![Visual Studio 步入虚调用后停在 Derived::func1 的反汇编](/img/posts/cpp-virtual-call-target.webp)

反汇编用的是另一次调试截图，不用对照绝对地址，看清函数名和查表过程就行。红框里是进入函数后的准备指令，真正打印 `Derived` 的代码在下面

开了优化以后，如果编译器能确定实际要调谁，也可能直接调用那个函数，省掉这次查表，这叫**去虚拟化**

### 虚指针会让对象变大吗？

`sizeof` 可以读出一个类型的对象占多少字节

下面对比空类、只有一个虚函数的类和一个指针的大小

```cpp
#include <iostream>

struct Empty
{
};

struct HasVirtual
{
    virtual void ping()
    {
    }
};

int main()
{
    std::cout << sizeof(Empty) << '\n';
    std::cout << sizeof(HasVirtual) << '\n';
    std::cout << sizeof(void*) << '\n';
}
```

在 Windows x64 的 MinGW-w64 GCC 8.1 上，这三行分别输出 `1`、`8`、`8`

空类 `Empty` 的完整对象也得占点地方，这里是 1 字节；`HasVirtual` 在这个例子里正好用 8 字节存下虚指针

两个结果差了 7 字节，但**差值不等于虚指针的大小**，也不能反过来推断所有类一加虚函数就会大 8 字节，类原来的布局和编译器留出的空位都会影响结果

`sizeof` 只能告诉你大小，不能单凭这三个数字就断定指针放在哪里

### 多重继承时，为什么还要调整 this？（进阶）

对象在内存里怎么排、函数参数怎么传，取决于编译器采用的约定，这套约定叫 **ABI**

前面的调试例子里，每个派生类都只继承了一个基类

现在假设一个对象同时继承 `Left` 和 `Right`，两个基类都有虚函数

通过 `Right*` 看它时，指针指向的是 `Right` 子对象，不保证和完整对象的地址一样

可是如果虚调用最后跳到了派生类的实现，那个实现又需要拿到正确的派生类 `this`

常见实现会给不同的基类子对象安排各自需要的表入口，其中某个入口可能先调整 `this`，再跳到真正的派生类函数

这段小代码常叫 **thunk**

这也是为什么「每个对象只有一个 vptr、每类一张表」只适合拿来理解前面的简单例子，不能当成通用结论

还有一个名字很像的概念：**虚继承**

比如 `Left` 和 `Right` 都通过 `virtual` 继承 `Root`，最终同时继承两者的对象就共享一份 `Root` 虚基类子对象

虚函数回答「调用哪个版本」，虚继承回答「两条继承路径是不是共用那份基类子对象」

有的 ABI 用单独的表帮助定位虚基类，也有 ABI 把相关偏移存在虚表里，不是所有编译器都用同一种布局

## 最后怎么判断？

| 看到的代码 | 先问自己什么？ |
| --- | --- |
| `person.role()` | 静态类型的接口选中了什么函数？这个调用会走虚派发吗？ |
| `Person person = student;` | 是在借用原对象，还是已经复制出一个新的 `Person`？ |
| `delete p` 或默认删除器的 `unique_ptr<Person>` | 这里是不是要通过基类销毁派生对象？这个基类允许这么做吗？ |
| 构造或析构里调用 `role()` | 正在构造或析构的是哪一层？ |
| 调试器里的 vptr 和表项 | 这是 C++ 保证的行为，还是我这套编译器恰好这样实现？ |

以后遇到 `virtual`，可以先别背那句「取指针、查表、调用」

先看代码能调用什么，再看实际用的是哪个对象，最后分清楚谁负责销毁它

这几件事分清了，再去看虚表，调试器里的地址就有意义了

## 参考资料

1. 程序员陈子青.  
   C++高频面试-虚函数表的底层原理与内存布局 —— 一个视频带你彻底理解虚函数表机制[EB/OL].  
   Bilibili, 2025-03-11  
   [2026-11-18]. https://www.bilibili.com/video/BV1mBRLYeE6R.
2. 爱编程的大丙.  
   一个类只要有了虚函数，析构就必须是虚的吗？[EB/OL].  
   Bilibili, 2026-11-17  
   [2026-11-18]. https://www.bilibili.com/video/BV1qgsz6KEiN.
3. Z_Coding.  
   学C++必看：一个视频带你搞懂：虚函数、虚函数表、虚指针[EB/OL].  
   Bilibili, 2026-07-06  
   [2026-11-18]. https://www.bilibili.com/video/BV1DyTQ6UEty.

- cppreference：[Virtual function](https://en.cppreference.com/w/cpp/language/virtual.html)、[delete expression](https://en.cppreference.com/w/cpp/language/delete.html)
- C++ Core Guidelines：[C.35：基类析构函数的设计](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rc-dtor-virtual)


