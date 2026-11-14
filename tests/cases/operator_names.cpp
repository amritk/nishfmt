std::ostream &operator<< (std::ostream &os, const A &a);
std::ostream &operator<<(std::ostream &os, const A &a);
bool operator== (const A &a);
void f() { ::operator delete (p); }
void f() { ::operator new (p); }
void *operator new (size_t n);
std::ostream &operator<<(std::ostream &os, const A &a);
ostream &operator<<(ostream &os, const A &a);
